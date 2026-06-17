/**
 * ipgeo-lookup.js
 *
 * Node-RED node: "ipgeo lookup"
 *
 * Performs a single-IP geolocation lookup via the IPGeolocation.io
 * /v3/ipgeo endpoint (GET).
 *
 * Features
 * ─────────
 *  • IPv4, IPv6, domain, or empty (caller IP auto-detect)
 *  • Configurable `include` modules: security, abuse, hostname, user_agent,
 *    geo_accuracy, dma_code  (comma-separated)
 *  • `fields` and `excludes` for bandwidth optimisation
 *  • Response language selection (12 languages)
 *  • Optional custom User-Agent header forwarding
 *  • Hostname lookup variants: hostname | liveHostname | hostnameFallbackLive
 *  • IP can be sourced from node config OR msg property (dynamic)
 *  • Two outputs: [success, error] — error output is optional
 *  • Exposes credits consumed on msg.ipgeo_credits
 *  • Full retry + exponential backoff via shared api-client
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

  function IPGeoLookupNode(config) {
    RED.nodes.createNode(this, config);

    // ── Config node (API key) ─────────────────────────────────────────────
    const configNode = RED.nodes.getNode(config.server);

    // ── Node configuration ────────────────────────────────────────────────
    this.name        = config.name;
    this.ipType      = config.ipType      || 'str';      // 'str' | 'msg'
    this.ipValue     = config.ipValue     || '';          // value or msg prop path
    this.include     = config.include     || '';          // comma-sep list of modules
    this.fields      = config.fields      || '';
    this.excludes    = config.excludes    || '';
    this.lang        = config.lang        || 'en';
    this.outputProp  = config.outputProp  || 'payload';   // output property
    this.outputType  = config.outputType  || 'msg';
    this.uaHeader    = config.uaHeader    || false;       // forward UA from msg
    this.uaProp      = config.uaProp      || 'req.headers.user-agent';
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

      // ── Resolve IP from msg or static config ──────────────────────────
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
        // 'str' — static value from node config; can be empty for caller-IP
        ip = (node.ipValue || '').trim();
      }

      ip = String(ip).trim();

      // ── Build query parameters ────────────────────────────────────────
      const params = buildCommonParams(apiKey, {
        lang:     node.lang,
        fields:   node.fields,
        excludes: node.excludes,
      });

      if (ip) params.ip = ip;

      // Build include list (may come from node config or msg override)
      const includeList = (msg.ipgeo_include || node.include || '').trim();
      if (includeList) params.include = includeList;

      // ── Optional User-Agent header forwarding ─────────────────────────
      const extraHeaders = {};
      if (node.uaHeader) {
        const ua = resolveValue(RED, node, msg,
          { value: node.uaProp, type: 'msg' });
        if (ua) extraHeaders['User-Agent'] = ua;
      }

      // ── Set working status ────────────────────────────────────────────
      setStatus(node, 'WORKING');

      // ── API call ──────────────────────────────────────────────────────
      try {
        const { data, credits } = await request({
          method:  'GET',
          path:    '/ipgeo',
          params,
          headers: extraHeaders,
        });

        // ── Success ────────────────────────────────────────────────────
        setStatus(node, 'OK',
          `${data.location?.city || data.ip || 'ok'}`);

        // Write result to configured output property
        setOutputProperty(RED, node, msg,
          { value: node.outputProp, type: node.outputType }, data);

        // Expose credits consumed (informational)
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

  RED.nodes.registerType('ipgeo-lookup', IPGeoLookupNode);

};
