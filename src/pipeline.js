const { parseTranscript } = require('./parser');
const { validateWithGroq } = require('./validator');
const { executeAuthorized, executeEscalation, executeFlag } = require('./actions');
const { updatePipeline } = require('./pipeline-state');

const fs = require('fs').promises;
const path = require('path');

const log = console.log;
const scalekit = {
  fetchDoc: async (docName) => {
    try {
      if (docName === 'orders.json') {
        const data = await fs.readFile(path.join(__dirname, '../docs/orders.json'), 'utf8');
        return JSON.parse(data);
      } else {
        return await fs.readFile(path.join(__dirname, '../docs/', docName), 'utf8');
      }
    } catch (err) {
      console.error('Error fetching doc:', err);
      return '';
    }
  }
};

async function processMeeting(transcript, agentId, callId, scenario) {

  // Step 1 — parse transcript
  const extracted = await parseTranscript(transcript, scenario);
  if (!extracted.refund_promised) {
    const msg = 'No refund promised — nothing to do';
    log(msg);
    updatePipeline('flagged', msg);
    return { success: true, message: msg };
  }

  // Step 2 — fetch internal docs via Scalekit
  const policy = await scalekit.fetchDoc('refund-policy.md');
  const orderDB = await scalekit.fetchDoc('orders.json');

  // If the parser missed the amount or customer name, pull it from the DB
  if (extracted.order_id && orderDB[extracted.order_id]) {
    if (!extracted.refund_amount) {
      extracted.refund_amount = orderDB[extracted.order_id].amount;
    }
    if (!extracted.customer_name) {
      extracted.customer_name = orderDB[extracted.order_id].customerName;
    }
  }

  updatePipeline('validating', `Extracted $${extracted.refund_amount} refund for ${extracted.customer_name || extracted.customer_id} (${extracted.order_id})`);

  // Step 3 — Groq validates everything in one pass
  const decision = await validateWithGroq({ extracted, policy, orderDB });

  updatePipeline('validating', `Groq decision: ${decision.action} — ${decision.reason}`);

  // Step 4 — act on Groq's decision
  let actionResult;
  if (decision.action === 'approve') {
    actionResult = await executeAuthorized(extracted, agentId, callId);
  } else if (decision.action === 'escalate') {
    actionResult = await executeEscalation(extracted, decision.reason, callId, 100);
  } else {
    actionResult = await executeFlag(extracted, decision, callId);
  }

  return {
    success: true,
    decision,
    actionResult
  };
}

module.exports = { processMeeting };