/**
 * Shared pipeline state — used by server.js, pipeline.js, and actions.js
 * Extracted into its own module to avoid circular dependencies.
 */

const pipelineState = {
  stage: 'idle',
  lastEvent: null,
  lastMessage: null,
  log: [],
  updatedAt: null
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

module.exports = { pipelineState, updatePipeline };
