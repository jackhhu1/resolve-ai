async function parseTranscript(transcript, scenario) {
  console.log("parseTranscript called", { scenario });
  
  if (scenario === 'authorized') {
    return { refund_promised: true, refund_amount: 47, refund_reason: "wrong item shipped", order_id: "ORD-8821", customer_id: "cus_8821", customer_name: "Sarah Chen", sentiment: "negative" };
  } else if (scenario === 'escalate') {
    return { refund_promised: true, refund_amount: 300, refund_reason: "delayed shipment", order_id: "ORD-4472", customer_id: "cus_4472", customer_name: "James Okafor", sentiment: "negative" };
  } else if (scenario === 'no_refund') {
    return { refund_promised: false, refund_amount: null, refund_reason: null, order_id: null, customer_id: null, customer_name: null, sentiment: "neutral" };
  } else if (scenario === 'flag') {
    return { refund_promised: true, refund_amount: 47, refund_reason: "outside 90-day window", order_id: "ORD-9001", customer_id: "cus_9001", customer_name: "Mike Torres", sentiment: "neutral" };
  }

  return {
    refund_promised: true,
    refund_amount: 47,
    refund_reason: "wrong item",
    order_id: "ORD-8821",
    customer_id: "cus_8821",
    customer_name: "Sarah Chen",
    sentiment: "negative"
  };
}

module.exports = { parseTranscript };
