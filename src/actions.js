async function executeAuthorized(amount, customerId, agentId, callId) {
  console.log("executeAuthorized called");
  if (process.env.MOCK_MODE === 'true') {
    const msg = `MOCK: Stripe refund of $${amount} fired for ${customerId}`;
    console.log(msg);
    return msg;
  }
}

async function executeEscalation(amount, customerId, reason, transcript, limit) {
  console.log("executeEscalation called");
  if (process.env.MOCK_MODE === 'true') {
    const msg = `MOCK: Jira ticket created for $${amount} refund — ${reason}`;
    console.log(msg);
    return msg;
  }
}

module.exports = { executeAuthorized, executeEscalation };
