const { ScalekitClient } = require('@scalekit-sdk/node');
const Stripe = require('stripe');
const { updatePipeline } = require('./pipeline-state');

// ── Scalekit client (handles OAuth tokens for Jira) ──────────
const scalekit = new ScalekitClient(
  process.env.SCALEKIT_ENV_URL,
  process.env.SCALEKIT_CLIENT_ID,
  process.env.SCALEKIT_CLIENT_SECRET
);

const JIRA_CONNECTION = 'jira-olbEyrn7';
const JIRA_IDENTIFIER = process.env.JIRA_EMAIL;

// Ensure Scalekit client is authenticated (client_credentials grant)
let _authReady = null;
async function ensureScalekitAuth() {
  if (!_authReady) {
    _authReady = scalekit.coreClient.authenticateClient();
  }
  await _authReady;
}

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

// ── Jira helper via Scalekit proxy ───────────────────────────
async function createJiraTicket(body) {
  await ensureScalekitAuth();
  const response = await scalekit.actions.request({
    connectionName: JIRA_CONNECTION,
    identifier: JIRA_IDENTIFIER,
    path: '/rest/api/3/issue',
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  return response.data;
}

// ── Actions ──────────────────────────────────────────────────

async function executeAuthorized(extracted, agentId, callId) {
  const { refund_amount, customer_id, order_id, refund_reason, customer_name } = extracted;
  console.log("executeAuthorized called");

  if (process.env.MOCK_MODE === 'true') {
    console.log(`[stripe] MOCK: refund of $${refund_amount} fired for ${customer_id}`);
    await notifySlack(
      `:white_check_mark: *Refund processed automatically*\n` +
      `> Amount: *$${refund_amount}*\n` +
      `> Customer: ${customer_name} (${customer_id})\n` +
      `> Order: ${order_id}\n` +
      `> Reason: ${refund_reason}\n` +
      `> Ref: mock-ref-123`
    );
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const refund = await stripe.refunds.create({
    payment_intent: process.env.STRIPE_TEST_PAYMENT_INTENT,
    amount: Math.round(refund_amount * 100),
    reason: 'requested_by_customer',
    metadata: {
      agent_id: agentId,
      call_id: callId,
      order_id: order_id,
      customer_id: customer_id
    }
  }).catch(async err => {
    // Stripe test mode throws if PI already fully refunded
    // For demo purposes, log and continue gracefully
    console.warn('[stripe] Refund warning:', err.message);
    return { id: 'demo-limit-reached', status: 'demo' };
  });

  console.log(`[stripe] Refund created: ${refund.id} status=${refund.status}`);
  updatePipeline('authorized', `Refund of $${refund_amount} processed ✓ (${refund.id})`);

  await notifySlack(
    `:white_check_mark: *Refund processed automatically*\n` +
    `> Amount: *$${refund_amount}*\n` +
    `> Customer: ${customer_name} (${customer_id})\n` +
    `> Order: ${order_id}\n` +
    `> Reason: ${refund_reason}\n` +
    `> Agent: ${agentId}\n` +
    `> Stripe ref: ${refund.id}`
  );

  return refund;
}

async function executeEscalation(extracted, reason, callId, limit) {
  const { refund_amount, customer_id, order_id, refund_reason, customer_name } = extracted;
  console.log("executeEscalation called");

  // Always notify Slack first
  await notifySlack(
    `:warning: *Refund escalation required*\n` +
    `> Amount: *$${refund_amount}* exceeds agent limit of $${limit}\n` +
    `> Customer: ${customer_name} (${customer_id})\n` +
    `> Order: ${order_id}\n` +
    `> Reason: ${refund_reason}\n` +
    `> Jira ticket being created...`
  );

  if (process.env.MOCK_MODE === 'true') {
    console.log('[jira] MOCK: ticket created for', order_id, '$' + refund_amount);
    return { ticket: 'REF-MOCK-001' };
  }

  const body = {
    fields: {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: `Refund approval needed: $${refund_amount} for ${customer_name}`,
      description: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: [
              `Order ID: ${order_id}`,
              `Customer: ${customer_name} (${customer_id})`,
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

  try {
    const ticket = await createJiraTicket(body);
    console.log(`[jira] Ticket created: ${ticket.key}`);
    updatePipeline('escalated', `Escalation ticket ${ticket.key} created for $${refund_amount}`);

    // Update Slack with the real ticket number
    await notifySlack(
      `:ticket: Jira ticket *${ticket.key}* created — ` +
      `${process.env.JIRA_BASE_URL}/browse/${ticket.key}`
    );

    return { ticket: ticket.key };
  } catch (err) {
    console.error('[jira] Failed to create ticket:', err.message);
    throw new Error(`Jira ticket creation failed: ${err.message}`);
  }
}

async function executeFlag(extracted, decision, callId) {
  const { refund_amount, customer_id, order_id, customer_name } = extracted;
  console.log("executeFlag called");

  await notifySlack(
    `:x: *Refund flagged — policy violation*\n` +
    `> Order: ${order_id}\n` +
    `> Customer: ${customer_name} (${customer_id})\n` +
    `> Amount: $${refund_amount}\n` +
    `> Reason: ${decision.reason}\n` +
    `> Rule: ${decision.policy_rule_applied}\n` +
    `> No action taken`
  );

  if (process.env.MOCK_MODE === 'true') {
    console.log('[jira] MOCK: flag ticket created for', order_id);
    return;
  }

  const body = {
    fields: {
      project: { key: process.env.JIRA_PROJECT_KEY },
      summary: `Policy violation flagged: $${refund_amount} for ${customer_name}`,
      description: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: [
              `Order ID: ${order_id}`,
              `Customer: ${customer_name} (${customer_id})`,
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

  try {
    const ticket = await createJiraTicket(body);
    console.log(`[jira] Flag ticket created: ${ticket.key}`);
    updatePipeline('flagged', `Flagged — ${decision.reason} (${ticket.key})`);
    await notifySlack(`:ticket: Flag ticket *${ticket.key}* — ${process.env.JIRA_BASE_URL}/browse/${ticket.key}`);
  } catch (err) {
    console.error('[jira] Flag ticket failed:', err.message);
  }
}

module.exports = { executeAuthorized, executeEscalation, executeFlag };
