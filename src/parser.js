const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function parseTranscript(transcript, scenario) {
  console.log("parseTranscript called", { scenario });
  
  if (scenario) {
    if (scenario === 'authorized') {
      return { refund_promised: true, refund_amount: 47, refund_reason: "wrong item shipped", order_id: "ORD-8821", customer_id: "cus_8821", customer_name: "Sarah Chen", sentiment: "negative" };
    } else if (scenario === 'escalate') {
      return { refund_promised: true, refund_amount: 300, refund_reason: "delayed shipment", order_id: "ORD-4472", customer_id: "cus_4472", customer_name: "James Okafor", sentiment: "negative" };
    } else if (scenario === 'no_refund') {
      return { refund_promised: false, refund_amount: null, refund_reason: null, order_id: null, customer_id: null, customer_name: null, sentiment: "neutral" };
    } else if (scenario === 'flag') {
      return { refund_promised: true, refund_amount: 47, refund_reason: "outside 90-day window", order_id: "ORD-9001", customer_id: "cus_9001", customer_name: "Mike Torres", sentiment: "neutral" };
    }
  }

  // Fallback to real Groq extraction if no MOCK scenario matched
  if (!transcript || transcript.trim() === '') {
    return { refund_promised: false }; // no transcript provided
  }

  console.log('[parser] Real transcript provided, extracting entities...');
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are an entity extraction service. You will be given a transcript between a customer and customer support.
Determine if the agent promised a refund. If so, extract the required fields. Respond ONLY with valid JSON.`
      },
      {
        role: 'user',
        content: `TRANSCRIPT:
${transcript}

Extract and map to this JSON structure:
{
  "refund_promised": boolean,
  "refund_amount": number | null,
  "refund_reason": string | null,
  "order_id": string | null,
  "customer_id": string | null,
  "customer_name": string | null,
  "sentiment": "positive" | "negative" | "neutral"
}`
      }
    ]
  });

  const text = response.choices[0].message.content.trim();
  const clean = text.replace(/`{3,}(?:json)?/g, '').trim();
  return JSON.parse(clean);
}

module.exports = { parseTranscript };
