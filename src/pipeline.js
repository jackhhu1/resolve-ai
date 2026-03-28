const { parseTranscript } = require('./parser');
const { checkAuthorized } = require('./auth');
const { executeAuthorized, executeEscalation } = require('./actions');

async function processMeeting(transcript, agentId, callId, scenario) {
  console.log(`processMeeting started for callId: ${callId}`);
  
  const parsedData = await parseTranscript(transcript, scenario);
  console.log("Parsed Data:", parsedData);
  
  const authResult = await checkAuthorized(agentId, parsedData.refund_amount);
  console.log("Auth Result:", authResult);
  
  let actionLog = "";
  if (authResult.authorized) {
    actionLog = await executeAuthorized(parsedData.refund_amount, parsedData.customer_id, agentId, callId);
  } else {
    actionLog = await executeEscalation(parsedData.refund_amount, parsedData.customer_id, parsedData.refund_reason, transcript, authResult.limit);
  }
  return { parsedData, authResult, actionLog };
}

module.exports = { processMeeting };
