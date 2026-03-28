require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhook/meetstream', (req, res) => {
  console.log('Webhook received:', req.body);
  res.sendStatus(200);
});

const { processMeeting } = require('./pipeline');

app.post('/test/:scenario', async (req, res) => {
  console.log(`Test scenario triggered: ${req.params.scenario}`);
  try {
    const result = await processMeeting(null, 'agent_junior', 'test_call_123', req.params.scenario);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
