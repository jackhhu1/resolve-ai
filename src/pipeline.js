const { parseTranscript } = require('./parser');
const { validateWithGroq } = require('./validator');
const { executeAuthorized, executeEscalation, executeFlag } = require('./actions');
const { updatePipeline, updateMetrics } = require('./pipeline-state');

const fs = require('fs').promises;
const path = require('path');

const log = console.log;
const { ScalekitClient } = require('@scalekit-sdk/node');

// ── Scalekit client (handles OAuth tokens) ──────────
const realScalekit = new ScalekitClient(
  process.env.SCALEKIT_ENV_URL,
  process.env.SCALEKIT_CLIENT_ID,
  process.env.SCALEKIT_CLIENT_SECRET
);

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
  },
  
  queryNotionOrder: async (orderId) => {
    let conn = process.env.NOTION_CONNECTION;
    let ident = process.env.NOTION_IDENTIFIER || 'agent@demo.com';

    if (!conn) {
      console.log("[notion] NOTION_CONNECTION not configured, skipping Notion search");
      return null;
    }

    try {
      console.log(`[notion] Querying Notion for order: ${orderId}`);
      await realScalekit.coreClient.authenticateClient();
      
      // Intelligent resolution if the user passed a connected account ID
      if (conn.startsWith('ca_')) {
         const accounts = await realScalekit.actions.connectedAccounts.listConnectedAccounts();
         const target = accounts?.data?.connectedAccounts?.find(a => a.id === conn);
         if (target) {
            conn = target.connector;
            ident = target.identifier;
            console.log(`[notion] Resolved ca_ ID to connection: ${conn}, identifier: ${ident}`);
         } else {
            console.log(`[notion] Warning: Could not resolve connected account ${conn}`);
         }
      }
      
      const response = await realScalekit.actions.request({
        connectionName: conn,
        identifier: ident,
        path: '/v1/databases/26fcef82cf4d81349cc9f15db6413f4b/query',
        method: 'POST',
        body: {
          filter: { 
            property: "title", 
            title: { "contains": orderId } 
          },
          page_size: 1
        },
        headers: {
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        }
      });
      
      if (response && response.data && response.data.results && response.data.results.length > 0) {
        const page = response.data.results[0];
        const props = page.properties || {};
        
        let amount = null;
        let customerName = null;
        let customerId = null;
        
        // Extract dynamically based on Notion database properties schema
        if (props.Amount && props.Amount.number !== undefined) amount = props.Amount.number;
        else if (props.amount && props.amount.number !== undefined) amount = props.amount.number;
        
        if (props.CustomerName && props.CustomerName.rich_text && props.CustomerName.rich_text[0]) customerName = props.CustomerName.rich_text[0].plain_text;
        else if (props.customer_name && props.customer_name.rich_text && props.customer_name.rich_text[0]) customerName = props.customer_name.rich_text[0].plain_text;
        else if (props.Customer && props.Customer.title && props.Customer.title[0]) customerName = props.Customer.title[0].plain_text;
        
        if (props.CustomerID && props.CustomerID.rich_text && props.CustomerID.rich_text[0]) customerId = props.CustomerID.rich_text[0].plain_text;
        
        console.log(`[notion] Found order ${orderId} in Notion! Amount: $${amount}, Customer: ${customerName}`);
        
        return {
          amount,
          customerName,
          customerId,
          status: 'delivered', // Assume delivered for hackathon demo unless we parse it out
          refundable: true,
          found_in_notion: true
        };
      }
      console.log(`[notion] Order ${orderId} not found in Notion.`);
      return null;
    } catch (err) {
      console.error('[notion] Error authenticating or querying Notion via Scalekit:', err.message);
      return null;
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
  if (extracted.order_id) {
    // 1. Try fetching from Notion via Scalekit first
    const notionOrder = await scalekit.queryNotionOrder(extracted.order_id);
    let orderData = notionOrder;

    // 2. Failsafe to local orders.json if not found in Notion
    if (!orderData && orderDB[extracted.order_id]) {
        console.log(`[notion] Failsafe: using orders.json for ${extracted.order_id}`);
        orderData = orderDB[extracted.order_id];
    }
    
    // Enrich extracted data
    if (orderData) {
      if (!extracted.refund_amount && orderData.amount) {
        extracted.refund_amount = orderData.amount;
      }
      if (!extracted.customer_name && orderData.customerName) {
        extracted.customer_name = orderData.customerName;
      }
      
      // We pass orderData into Groq validate since the validator expects a JSON object of the single order
      // (The prompt might expect orderDB as full DB or single object, so keep orderDB as is but maybe inject notion stuff)
      if (notionOrder) {
        // Inject the dynamically found order back into orderDB so Groq sees it during validation
        orderDB[extracted.order_id] = notionOrder;
      }
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
    updateMetrics({ timeSaved: 15, dollarsSaved: 0, isFraudulent: false });
  } else if (decision.action === 'escalate') {
    actionResult = await executeEscalation(extracted, decision.reason, callId, 100);
    updateMetrics({ timeSaved: 15, dollarsSaved: 0, isFraudulent: false });
  } else {
    actionResult = await executeFlag(extracted, decision, callId);
    updateMetrics({ timeSaved: 15, dollarsSaved: extracted.refund_amount, isFraudulent: true });
  }

  return {
    success: true,
    decision,
    actionResult
  };
}

module.exports = { processMeeting };