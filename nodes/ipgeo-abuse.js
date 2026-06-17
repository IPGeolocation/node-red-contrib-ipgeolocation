/**
 * ipgeo-abuse.js
 *
 * Node-RED node: "ipgeo abuse"
 *
 * Performs a single-IP abuse contact lookup via the IPGeolocation.io
 * /v3/abuse endpoint (GET).
 *
 * Features
 * ─────────
 *  • IPv4 or IPv6 input, or empty (caller IP auto-detect)
 *  • `fields` and `excludes` for bandwidth optimisation (dot-notation,
 *    e.g. abuse.emails / abuse.phone_numbers)
 *  • IP can be sourced from node config OR msg property (dynamic)
 *  • Two outputs: [success, error] — error output is optional
 *  • Exposes credits consumed on msg.ipgeo_credits (flat 1 credit/lookup)
 *  • Full retry + exponential backoff via shared api-client
 *
 * Shares the same `ipgeo-config` config node (API key) as ipgeo-lookup
 * and ipgeo-security.
 */

'use strict';

const { request, IPGeoError } = require('./lib/api-client');
const {
  setStatus,
  resolveValue,
  setOutputProperty,
  handleNodeError,
  buildCommonParams,
} = require('./lib/node-helpers');

module.exports = function (RED) {

  function IPGeoAbuseNode(config) {
    RED.nodes.createNode(this, config);

    // ── Config node (API key) ─────────────────────────────────────────────
    const configNode = RED.nodes.getNode(config.server);

    // ── Node configuration ────────────────────────────────────────────────
    this.name        = config.name;
    this.ipType      = config.ipType      || 'str';      // 'str' | 'msg' | 'flow' | 'global'
    this.ipValue     = config.ipValue     || '';          // value or msg/flow/global prop path
    this.fields      = config.fields      || '';
    this.excludes    = config.excludes    || '';
    this.outputProp  = config.outputProp  || 'payload';   // output property
    this.outputType  = config.outputType  || 'msg';
    this.twoOutputs  = config.twoOutputs  !== false;      // default true

    const node = this;

    // ── Pre-flight: warn if no config node ───────────────────────────────
    if (!configNode) {
      setStatus(node, 'NO_KEY');
      node.warn('No IPGeolocation.io config node selected — configure an API key first.');
    } else {
      setStatus(node, 'IDLE');
    }

    // ── Input handler ─────────────────────────────────────────────────────
    node.on('input', async function (msg, send, done) {
      // Node-RED 0.x compat
      send = send || function () { node.send.apply(node, arguments); };

      // ── Validate API key availability ─────────────────────────────────
      const apiKey = configNode && configNode.credentials
        ? configNode.credentials.apiKey
        : null;

      if (!apiKey) {
        setStatus(node, 'NO_KEY');
        const err = new IPGeoError('No API key configured', 'NO_API_KEY');
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      // ── Resolve IP from msg/flow/global or static config ──────────────
      let ip = '';
      if (node.ipType === 'msg') {
        ip = resolveValue(RED, node, msg,
          { value: node.ipValue, type: 'msg' }) || '';
      } else if (node.ipType === 'flow') {
        ip = resolveValue(RED, node, msg,
          { value: node.ipValue, type: 'flow' }) || '';
      } else if (node.ipType === 'global') {
        ip = resolveValue(RED, node, msg,
          { value: node.ipValue, type: 'global' }) || '';
      } else {
        // 'str' — static value from node config
        ip = (node.ipValue || '').trim();
      }

      ip = String(ip).trim();

      // ── Build query parameters ────────────────────────────────────────
      // Abuse endpoint has no `lang` or `include` params — just
      // apiKey / ip / fields / excludes. Like /ipgeo and /security, an
      // omitted ip auto-detects the caller's IP.
      const params = buildCommonParams(apiKey, {
        fields:   node.fields,
        excludes: node.excludes,
      });

      if (ip) params.ip = ip;

      // ── Set working status ────────────────────────────────────────────
      setStatus(node, 'WORKING');

      // ── API call ──────────────────────────────────────────────────────
      try {
        const { data, credits } = await request({
          method: 'GET',
          path:   '/abuse',
          params,
        });

        // ── Success ────────────────────────────────────────────────────
        setStatus(node, 'OK', data.abuse?.organization || data.abuse?.name || data.ip || 'ok');

        // Write result to configured output property
        setOutputProperty(RED, node, msg,
          { value: node.outputProp, type: node.outputType }, data);

        // Expose credits consumed (informational) — flat 1 credit/lookup
        if (credits !== null) msg.ipgeo_credits = credits;

        // Clear error property if previously set
        delete msg.error;

        send(node.twoOutputs ? [msg, null] : msg);
        if (done) done();

      } catch (err) {
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
      }
    });

    // ── Clean up on node removal/redeploy ─────────────────────────────────
    node.on('close', function () {
      setStatus(node, 'IDLE');
    });
  }

  RED.nodes.registerType('ipgeo-abuse', IPGeoAbuseNode);

};