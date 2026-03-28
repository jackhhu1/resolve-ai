# Refund Resolution Bot

An intelligent, automated live-meeting agent designed to sit in on customer support calls, monitor conversations for refund requests in real-time, and execute complex business logic autonomously. By combining state-of-the-art transcription, LLM-based entity extraction, and secure enterprise integrations, the bot can approve, escalate, or flag refunds instantly without manual intervention.

---

## 🚀 Key Technologies & Architecture

* **[MeetStream](https://meetstream.ai/) (Transcription & Ingestion):** Acts as the core meeting ingestion engine. It deploys bots directly into live Google Meet sessions, capturing real-time audio and returning highly accurate conversational transcripts (powered by AssemblyAI) the moment the call ends. The webhook event from MeetStream serves as the trigger for the entire resolution pipeline.
* **[Groq](https://groq.com/) (Decision Making):** Serves as the intelligent brain of the bot. Groq parses the MeetStream transcripts, extracts critical entities (customer name, order ID, refund amount, sentiment), and evaluates the natural language context against internal company policies to decide the definitive next action (`approve`, `escalate`, or `flag`).
* **[Scalekit](https://scalekit.com/) (Enterprise Auth & Integrations):** Manages secure, robust authentication and data fetching. It acts as a proxy for our critical integrations, seamlessly and securely connecting to **Jira** (for automated ticketing) and internal databases like **Notion** (for fetching dynamic context like `orders.json` and `refund-policy.md`) without exposing sensitive, long-lived tokens in our raw code.
* **[Stripe](https://stripe.com/):** Handles the actual financial fulfillment, dynamically creating payment intents and processing the final refund based on Groq's validation.
* **Slack Webhooks:** Provides real-time observability, notifying the support team with rich, formatted messages about pipeline outcomes, processed amounts, and Jira ticket links.

---

## ⚙️ How It Works (The Pipeline)

1. **Ingestion (`bot.joining`)**: A meeting URL is submitted via the custom dashboard, and a MeetStream bot joins the call as a silent participant.
2. **Transcription (`bot.stopped`)**: Once the meeting ends or the bot is kicked, it fetches the completed AssemblyAI transcript.
3. **Extraction & Enrichment**: Groq analyzes the conversation to extract the promised refund amount and reason. The pipeline then queries the internal order database (managed via Scalekit) to cross-reference the customer ID, human name, and transaction amount to prevent hallucinated data.
4. **Policy Validation**: Groq compares the extracted meeting context against the official `refund-policy.md` file to evaluate constraints (limits, expiration dates, allowable reasons) and make a final routing decision.
5. **Execution**:
   * ✅ **Authorized**: The agent stays within limits and policy. Stripe processes a dynamic refund instantly.
   * ⚠️ **Escalate**: The requested amount exceeds the agent's pre-approved limit. A Jira task is automatically generated for manager review.
   * 🚫 **Flagged**: The request violates a core constraint (e.g., outside the 90-day window or wrong name). A high-priority Jira flag is generated for manual auditing.
6. **Live Dashboard**: Throughout this process, a polling web dashboard visualizes the pipeline's progress in real-time, lighting up distinct stages while Slack simultaneously receives the definitive status updates.

---

## 🛠 Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Populate the `.env` file with your corresponding api keys.

3. Expose your local development port for MeetStream webhooks using [ngrok](https://ngrok.com/):
   ```bash
   ngrok http 3000
   ```
   *Make sure to update `NGROK_URL` in your `.env` to match your tunnel tunnel.*

4. Start the application:
   ```bash
   npm run dev
   ```

5. Navigate to your local Dashboard (`http://localhost:3000/dashboard`) to view the live UI, dispatch bots to your meetings, or run simulated automated test scenarios.
