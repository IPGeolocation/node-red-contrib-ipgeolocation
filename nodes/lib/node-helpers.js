/**
 * lib/node-helpers.js
 *
 * Utility functions shared across all IPGeolocation.io nodes.
 *
 * Contents
 * ─────────
 *  • setStatus / clearStatus  — node status shorthands
 *  • resolveValue             — reads msg / flow / global / str values
 *  • setOutputProperty        — writes to any msg / flow / global path
 *  • handleNodeError          — standard error handler (status + done)
 *  • buildCommonParams        — assembles shared query params (apiKey, lang, output, fields, excludes)
 */

'use strict';

// ─── Status Helpers ──────────────────────────────────────────────────────────

const STATUS = {
  IDLE:     { fill: 'grey',   shape: 'ring',  text: '' },
  WORKING:  { fill: 'blue',   shape: 'dot',   text: 'requesting…' },
  OK:       { fill: 'green',  shape: 'dot',   text: 'ok' },
  ERROR:    { fill: 'red',    shape: 'ring',  text: 'error' },
  NO_KEY:   { fill: 'red',    shape: 'ring',  text: 'no API key' },
  RATE_LIM: { fill: 'yellow', shape: 'ring',  text: 'rate limited' },
};

/**
 * Set a node status using a named key from STATUS, or a raw status object.
 * @param {object} node
 * @param {string|object} state  Key from STATUS or raw { fill, shape, text }
 * @param {string} [suffix]      Optional text appended to STATUS[state].text
 */
function setStatus(node, state, suffix) {
  if (typeof state === 'string' && STATUS[state]) {
    const s = { ...STATUS[state] };
    if (suffix) s.text = suffix;
    node.status(s);
  } else {
    node.status(state);
  }
}

/** Clear a node's status indicator. */
function clearStatus(node) {
  node.status({});
}

// ─── Value Resolution ────────────────────────────────────────────────────────

/**
 * Resolve a typed value from the message context.
 * Supports Node-RED's standard { value, type } descriptor types:
 *   msg, flow, global, str, num, bool, json, env
 *
 * @param {object} RED   Node-RED runtime
 * @param {object} node  The node instance (for flow/global context access)
 * @param {object} msg   The current message
 * @param {object} descriptor  { value: string, type: string }
 * @returns {*} Resolved value or undefined
 */
function resolveValue(RED, node, msg, descriptor) {
  if (!descriptor) return undefined;
  const { value, type } = descriptor;

  switch (type) {
    case 'msg':
      return RED.util.getMessageProperty(msg, value);

    case 'flow':
      return node.context().flow.get(value);

    case 'global':
      return node.context().global.get(value);

    case 'str':
      return String(value);

    case 'num':
      return Number(value);

    case 'bool':
      return value === true || value === 'true';

    case 'json':
      try { return JSON.parse(value); } catch { return undefined; }

    case 'env':
      return process.env[value];

    default:
      return value;
  }
}

// ─── Output Property Setter ──────────────────────────────────────────────────

/**
 * Write a value to a target on msg / flow / global.
 *
 * @param {object} RED
 * @param {object} node
 * @param {object} msg
 * @param {object} descriptor  { value: string, type: 'msg'|'flow'|'global' }
 * @param {*}      data        Value to write
 */
function setOutputProperty(RED, node, msg, descriptor, data) {
  if (!descriptor) return;
  const { value, type } = descriptor;

  switch (type) {
    case 'msg':
      RED.util.setMessageProperty(msg, value, data);
      break;
    case 'flow':
      node.context().flow.set(value, data);
      break;
    case 'global':
      node.context().global.set(value, data);
      break;
    default:
      RED.util.setMessageProperty(msg, value, data);
  }
}

// ─── Error Handler ───────────────────────────────────────────────────────────

/**
 * Standard error handler called from within input event listeners.
 * Sets an appropriate status, logs to the Node-RED debug panel, and
 * calls done(err) / node.error(err, msg) for Catch-node compatibility.
 *
 * @param {object} node
 * @param {Error}  err
 * @param {object} msg
 * @param {Function} done   Node-RED 1.0+ done callback
 * @param {Function} send   Node-RED send function (used for error port if configured)
 * @param {boolean}  [twoOutputs] Whether the node uses a second (error) output
 */
function handleNodeError(node, err, msg, done, send, twoOutputs) {
  const code = (err.code || 'ERROR').toUpperCase();

  // Choose the most informative status text
  let statusText = err.message || 'unknown error';
  if (statusText.length > 50) statusText = statusText.substring(0, 47) + '…';

  if (code === 'RATE_LIMITED') {
    setStatus(node, 'RATE_LIM');
  } else {
    setStatus(node, { fill: 'red', shape: 'ring', text: statusText });
  }

  // Attach error metadata to the message for downstream nodes
  msg.error = {
    code:    err.code   || 'ERROR',
    message: err.message,
    status:  err.status || null,
    body:    err.body   || null,
  };

  // If the node has a second output, emit error message there instead of throwing
  if (twoOutputs && send) {
    send([null, msg]);
    if (done) done();
    return;
  }

  // Standard Node-RED error handling (triggers Catch nodes)
  if (done) {
    done(err);
  } else {
    node.error(err.message, msg);
  }
}

// ─── Common Parameter Builder ────────────────────────────────────────────────

/**
 * Build the common query parameters shared by most IPGeo API calls.
 *
 * @param {string} apiKey
 * @param {object} nodeConfig  Node configuration properties
 * @returns {object} params object ready for Axios
 */
function buildCommonParams(apiKey, nodeConfig) {
  const params = { apiKey };

  if (nodeConfig.lang && nodeConfig.lang !== 'en') {
    params.lang = nodeConfig.lang;
  }
  if (nodeConfig.output && nodeConfig.output !== 'json') {
    params.output = nodeConfig.output;
  }
  if (nodeConfig.fields && nodeConfig.fields.trim()) {
    params.fields = nodeConfig.fields.trim();
  }
  if (nodeConfig.excludes && nodeConfig.excludes.trim()) {
    params.excludes = nodeConfig.excludes.trim();
  }

  return params;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  STATUS,
  setStatus,
  clearStatus,
  resolveValue,
  setOutputProperty,
  handleNodeError,
  buildCommonParams,
};
