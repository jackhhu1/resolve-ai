import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function validateWithGroq({ extracted, policy, orderDB }) {
  if (process.env.MOCK_MODE === 'true') {
    const mocks = {
      'ORD-8821': { action: 'approve', reason: 'Within $150 limit, order valid' },
      'ORD-4472': { action: 'escalate', reason: 'Exceeds $150 agent limit' },
      'ORD-9001': { action: 'flag', reason: 'Outside 90-day refund window' }
    };
    return mocks[extracted.order_id] ?? { action: 'flag', reason: 'Unknown order' };
  }

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are a refund validation agent. You will be given a 
company refund policy, an order database, and details extracted from a 
support call. Your job is to decide whether to approve, escalate, or flag 
the refund. Respond ONLY with valid JSON and nothing else.`
      },
      {
        role: 'user',
        content: `COMPANY POLICY:
${policy}

ORDER DATABASE:
${JSON.stringify(orderDB, null, 2)}

REFUND REQUEST FROM CALL:
- Order ID: ${extracted.order_id}
- Customer name: ${extracted.customer_name}
- Refund amount: $${extracted.refund_amount}
- Reason: ${extracted.refund_reason}

Respond with this exact JSON structure:
{
  "action": "approve" | "escalate" | "flag",
  "reason": "one sentence explanation",
  "policy_rule_applied": "the exact policy rule that determined this outcome",
  "order_valid": boolean,
  "amount_matches": boolean,
  "within_policy_limit": boolean
}`
      }
    ]
  });

  const text = response.choices[0].message.content.trim();
  console.log("RAW GROQ RESPONSE:");
  console.log(text);
  const clean = text.replace(/\`\`\`json|\`\`\`/gi, '').trim();
  return JSON.parse(clean);
}