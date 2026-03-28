require('dotenv').config();
const express = require('express');
const path = require('path');

const { processMeeting } = require('./pipeline');
const { joinMeeting, fetchTranscript } = require('./meetstream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── In-memory bot→agent mapping ──────────────────────────────
const botSessions = {}; // bot_id → { agent_id, transcript_id }

const { pipelineState, updatePipeline, resetPipeline } = require('./pipeline-state');

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Pipeline status (for dashboard polling) ──────────────────
app.get('/pipeline-status', (req, res) => {
  res.json(pipelineState);
});

// ── Pipeline reset ───────────────────────────────────────────
app.post('/pipeline-reset', (_req, res) => {
  resetPipeline();
  res.json({ ok: true });
});

// ── Webhook health check (GET) ───────────────────────────────
app.get('/webhook/meetstream', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'MeetStream webhook endpoint active' });
});

// ── MeetStream webhook (POST) ────────────────────────────────
app.post('/webhook/meetstream', async (req, res) => {
  res.status(200).send('ok');

  const { event, bot_id, bot_status, message } = req.body;
  console.log(`[meetstream] event=${event} bot_id=${bot_id} status=${bot_status ?? ''}`);

  if (event === 'bot.joining') {
    updatePipeline('joining', 'Bot joining meeting...');
  }

  if (event === 'bot.inmeeting') {
    updatePipeline('inmeeting', 'Bot live in meeting — speak clearly!');
  }

  if (event === 'audio.processed') {
    console.log('[meetstream] Audio ready — waiting for bot.stopped...');
  }

  if (event === 'transcription.processed') {
    console.log('[meetstream] Transcription processed — will fetch on bot.stopped');
  }

  if (event === 'bot.stopped') {
    console.log(`[meetstream] Bot stopped — reason: ${bot_status} — ${message ?? ''}`);
    updatePipeline('stopped', 'Meeting ended — fetching transcript');

    if (bot_status === 'NotAllowed' || bot_status === 'Denied' || bot_status === 'Error') {
      console.error('[meetstream] Bot failed:', message);
      updatePipeline('flagged', `Bot failed: ${message ?? bot_status}`);
      return;
    }

    // Small delay to let transcription finish processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const session = botSessions[bot_id] ?? {};
      const agentId = session.agent_id ?? 'agent@demo.com';
      const transcriptId = session.transcript_id;

      console.log('[meetstream] Fetching transcript for bot:', bot_id);
      const transcript = await fetchTranscript(bot_id, transcriptId);
      console.log(`[meetstream] Transcript (${transcript.length} chars):`, transcript.slice(0, 200));

      updatePipeline('parsing', `Transcript received (${transcript.length} chars) — parsing with Groq...`);
      await processMeeting(transcript, agentId, bot_id);
    } catch (err) {
      console.error('[meetstream] Pipeline error:', err.message);
      updatePipeline('flagged', `Pipeline error: ${err.message}`);
    }
  }
});

// ── Join a meeting ───────────────────────────────────────────
app.post('/join', async (req, res) => {
  const { meeting_url, agent_id = 'agent@demo.com' } = req.body;
  if (!meeting_url) {
    return res.status(400).json({ error: 'meeting_url is required' });
  }
  try {
    const result = await joinMeeting(meeting_url);
    botSessions[result.bot_id] = { 
      agent_id, 
      transcript_id: result.transcript_id 
    };
    console.log(`[join] Bot ${result.bot_id} joining for agent ${agent_id}`);
    res.json(result);
  } catch (err) {
    console.error('[join] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Test route ───────────────────────────────────────────────
app.post('/test/:scenario', async (req, res) => {
  console.log(`Test scenario triggered: ${req.params.scenario}`);
  updatePipeline('joining', `Test scenario: ${req.params.scenario}`);
  try {
    const result = await processMeeting(null, 'agent_junior', 'test_call_123', req.params.scenario);
    res.json(result);
  } catch (err) {
    updatePipeline('flagged', `Test error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard ────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Webhook endpoint: POST /webhook/meetstream`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`MOCK_MODE: ${process.env.MOCK_MODE}`);
});
