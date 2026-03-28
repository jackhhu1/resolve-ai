const { parseTranscript } = require('./parser');
const { validateWithGroq } = require('./validator');
const { executeAuthorized, executeEscalation, executeFlag } = require('./actions');

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
    return { success: true, message: msg };
  }

  // Step 2 — fetch internal docs via Scalekit
  const policy = await scalekit.fetchDoc('refund-policy.md');
  const orderDB = await scalekit.fetchDoc('orders.json');

  // Step 3 — Claude validates everything in one pass
  const decision = await validateWithGroq({ extracted, policy, orderDB });

  // Step 4 — act on Groq's decision
  let actionResult;
  if (decision.action === 'approve') {
    actionResult = await executeAuthorized(extracted.refund_amount, extracted.customer_id, agentId, callId);
  } else if (decision.action === 'escalate') {
    actionResult = await executeEscalation(extracted.refund_amount, extracted.customer_id, decision.reason, transcript, 100);
  } else {
    actionResult = await executeFlag(decision.reason, callId);
  }

  return {
    success: true,
    decision,
    actionResult
  };
}

module.exports = { processMeeting };