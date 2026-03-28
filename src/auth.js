async function checkAuthorized(agentId, requestedAmount) {
  console.log("checkAuthorized called");
  if (process.env.MOCK_MODE === 'true') {
    const limit = agentId === 'agent_senior' ? 1000 : 100;
    return {
      authorized: requestedAmount !== null && requestedAmount <= limit,
      limit,
      agentId,
      requestedAmount
    };
  }
  
  return {
    authorized: true,
    limit: 100,
    agentId,
    requestedAmount
  };
}

module.exports = { checkAuthorized };
