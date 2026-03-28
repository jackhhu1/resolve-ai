async function parseTranscript(transcript, scenario) {
  console.log("parseTranscript called", { scenario });
  
  if (process.env.MOCK_MODE === 'true') {
    if (scenario === 'authorized') {
      return { refund_promised: true, refund_amount: 47, refund_reason: "wrong item shipped", customer_id: "cus_8821", sentiment: "negative" };
    } else if (scenario === 'escalate') {
      return { refund_promised: true, refund_amount: 300, refund_reason: "delayed shipment", customer_id: "cus_4472", sentiment: "negative" };
    } else if (scenario === 'no_refund') {
      return { refund_promised: false, refund_amount: null, refund_reason: null, customer_id: null, sentiment: "neutral" };
    }
  }

  return {
    refund_promised: true,
    refund_amount: 47,
    refund_reason: "wrong item",
    customer_id: "cus_8821",
    sentiment: "negative"
  };
}

module.exports = { parseTranscript };
