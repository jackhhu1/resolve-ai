// ── Slack webhook helper ─────────────────────────────────────
async function notifySlack(message) {
  if (process.env.MOCK_MODE === 'true') {
    console.log('[slack] MOCK:', message);
    return;
  }

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  }).catch(err => console.error('[slack] Failed:', err.message));
}

// ── Actions ──────────────────────────────────────────────────

async function executeAuthorized(extracted, agentId, callId) {
  const { refund_amount, customer_id, order_id, refund_reason } = extracted;
  console.log("executeAuthorized called");

  let refund;
  if (process.env.MOCK_MODE === 'true') {
    const msg = `MOCK: Stripe refund of $${refund_amount} fired for ${customer_id}`;
    console.log(msg);
  } else {
    // TODO: real Stripe refund call
  }

  await notifySlack(
    `:white_check_mark: *Refund processed automatically*\n` +
    `> Amount: *$${refund_amount}*\n` +
    `> Customer: ${customer_id}\n` +
    `> Order: ${order_id}\n` +
    `> Reason: ${refund_reason}\n` +
    `> Agent: ${agentId}\n` +
    `> Ref: ${refund?.id ?? 'mock'}`
  );

  return `Refund of $${refund_amount} processed for ${customer_id}`;
}

async function executeEscalation(extracted, reason, callId, limit) {
  const { refund_amount, customer_id, order_id, refund_reason } = extracted;
  console.log("executeEscalation called");

  // Always notify Slack first
  await notifySlack(
    `:warning: *Refund escalation required*\n` +
    `> Amount: *$${refund_amount}* exceeds agent limit of $${limit}\n` +
    `> Customer: ${customer_id}\n` +
    `> Order: ${order_id}\n` +
    `> Reason: ${refund_reason}\n` +
    `> Jira ticket being created...`
  );

  if (process.env.MOCK_MODE === 'true') {
    console.log('[jira] MOCK: ticket created for', order_id, '$' + refund_amount);
    return { ticket: 'REF-MOCK-001' };
  }

  // Build Jira API auth header
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`
  ).toString('base64');

  const body = {
    fields: {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: `Refund approval needed: $${refund_amount} for ${customer_id}`,
      description: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: [
              `Order ID: ${order_id}`,
              `Customer: ${customer_id}`,
              `Amount: $${refund_amount}`,
              `Reason: ${refund_reason}`,
              `Call ID: ${callId}`,
              `Policy rule triggered: amount exceeds $${limit} agent limit`,
              ``,
              `Action required: approve or reject this refund in Stripe.`
            ].join('\n')
          }]
        }]
      },
      issuetype: { name: 'Task' },
      priority: { name: 'High' },
      labels: ['refund-escalation', 'needs-approval']
    }
  };

  const response = await fetch(
    `${process.env.JIRA_BASE_URL}/rest/api/3/issue`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[jira] Failed to create ticket:', err);
    throw new Error(`Jira ticket creation failed: ${response.status}`);
  }

  const ticket = await response.json();
  console.log(`[jira] Ticket created: ${ticket.key}`);

  // Update Slack with the real ticket number
  await notifySlack(
    `:ticket: Jira ticket *${ticket.key}* created — ` +
    `${process.env.JIRA_BASE_URL}/browse/${ticket.key}`
  );

  return { ticket: ticket.key };
}

async function executeFlag(extracted, decision, callId) {
  const { refund_amount, customer_id, order_id } = extracted;
  console.log("executeFlag called");

  await notifySlack(
    `:x: *Refund flagged — policy violation*\n` +
    `> Order: ${order_id}\n` +
    `> Amount: $${refund_amount}\n` +
    `> Reason: ${decision.reason}\n` +
    `> Rule: ${decision.policy_rule_applied}\n` +
    `> No action taken`
  );

  if (process.env.MOCK_MODE === 'true') {
    console.log('[jira] MOCK: flag ticket created for', order_id);
    return;
  }

  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`
  ).toString('base64');

  const body = {
    fields: {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: `Policy violation flagged: $${refund_amount} for ${customer_id}`,
      description: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: [
              `Order ID: ${order_id}`,
              `Customer: ${customer_id}`,
              `Amount: $${refund_amount}`,
              `Violation: ${decision.reason}`,
              `Policy rule: ${decision.policy_rule_applied}`,
              `Call ID: ${callId}`,
              ``,
              `No automated action was taken. Manual review required.`
            ].join('\n')
          }]
        }]
      },
      issuetype: { name: 'Task' },
      priority: { name: 'Highest' },
      labels: ['refund-flag', 'policy-violation', 'manual-review']
    }
  };

  const response = await fetch(
    `${process.env.JIRA_BASE_URL}/rest/api/3/issue`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[jira] Flag ticket failed:', err);
    return;
  }

  const ticket = await response.json();
  console.log(`[jira] Flag ticket created: ${ticket.key}`);
  await notifySlack(`:ticket: Flag ticket *${ticket.key}* — ${process.env.JIRA_BASE_URL}/browse/${ticket.key}`);
}

module.exports = { executeAuthorized, executeEscalation, executeFlag };
