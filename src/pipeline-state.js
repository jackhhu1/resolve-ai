/**
 * Shared pipeline state — used by server.js, pipeline.js, and actions.js
 * Extracted into its own module to avoid circular dependencies.
 */

const pipelineState = {
  stage: 'idle',
  lastEvent: null,
  lastMessage: null,
  log: [],
  updatedAt: null,
  metrics: {
    callsProcessed: 0,
    timeSavedMinutes: 0,
    dollarsSaved: 0,
    fraudulentCalls: 0
  }
};

function updatePipeline(stage, message) {
  pipelineState.stage = stage;
  pipelineState.lastMessage = message;
  pipelineState.updatedAt = new Date().toISOString();
  pipelineState.log.unshift({
    time: new Date().toLocaleTimeString(),
    message,
    stage
  });
  if (pipelineState.log.length > 20) pipelineState.log.pop();
  console.log(`[pipeline] ${stage}: ${message}`);
}

function updateMetrics({ timeSaved = 0, dollarsSaved = 0, isFraudulent = false }) {
  if (timeSaved) {
    pipelineState.metrics.callsProcessed += 1;
    pipelineState.metrics.timeSavedMinutes += timeSaved;
  }
  if (dollarsSaved) {
    pipelineState.metrics.dollarsSaved += dollarsSaved;
  }
  if (isFraudulent) {
    pipelineState.metrics.fraudulentCalls += 1;
  }
}

function resetPipeline() {
    pipelineState.stage = 'idle';
    pipelineState.lastEvent = null;
    pipelineState.lastMessage = null;
    pipelineState.log = [];
    pipelineState.updatedAt = null;
    // We intentionally don't reset metrics so the tracker persists across demos
}

module.exports = { pipelineState, updatePipeline, updateMetrics, resetPipeline };
