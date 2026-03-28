export async function processMeeting(transcript, agentId, callId) {

  // Step 1 — parse transcript
  const extracted = await parseTranscript(transcript);
  if (!extracted.refund_promised) return log('No refund promised — nothing to do');

  // Step 2 — fetch internal docs via Scalekit
  const policy = await scalekit.fetchDoc('refund-policy.md');
  const orderDB = await scalekit.fetchDoc('orders.json');

  // Step 3 — Claude validates everything in one pass
  const decision = await validateWithGroq({ extracted, policy, orderDB });

  // Step 4 — act on Claude's decision
  if (decision.action === 'approve') {
    await executeAuthorized(extracted, callId);
  } else if (decision.action === 'escalate') {
    await executeEscalation(extracted, decision.reason, callId);
  } else {
    await flagDiscrepancy(extracted, decision.reason, callId);
  }
}