/**
 * ipgeo-bulk-security.js
 *
 * Node-RED node: "ipgeo bulk security"
 *
 * Performs bulk IP security / threat lookups via the IPGeolocation.io
 * /v3/security-bulk endpoint (POST).
 *
 * Input
 * ─────
 *  msg.payload  — Array of IPv4/IPv6 address strings  (required)
 *               OR a comma-separated string which is auto-split
 *               (domain names are NOT supported by the Security API)
 *
 * Configuration
 * ─────────────
 *  • fields / excludes options (dot-notation, e.g. "security.threat_score")
 *  • No "include" or "lang" options — the Security API does not support them
 *  • Max 50,000 IPs per request (per API limits)
 *  • Each result corresponds to one IP in the input array, in order.
 *    Invalid/bogon/private/malformed IPs return { message: '...' } objects
 *    instead of failing the whole request (per API spec).
 *
 * Output
 * ──────
 *  msg.payload            — Array of security result objects
 *  msg.ipgeo_credits      — Credits consumed (2 per valid IP; from response header)
 *  msg.ipgeo_invalid_count    — Number of entries that came back as { message }
 *                               instead of a security result (only set if > 0,
 *                               mirroring the API's X-Successful-Record header
 *                               which is likewise only sent when invalid IPs
 *                               are present)
 *  msg.ipgeo_invalid_messages — Array of the invalid entries' messages
 *                               (only set if ipgeo_invalid_count > 0)
 */

'use strict';

const { request, IPGeoError } = require('./lib/api-client');
const {
  setStatus,
  setOutputProperty,
  handleNodeError,
  buildCommonParams,
} = require('./lib/node-helpers');

const MAX_IPS = 50_000;

module.exports = function (RED) {

  function IPGeoBulkSecurityNode(config) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.server);

    this.name       = config.name;
    this.fields     = config.fields    || '';
    this.excludes   = config.excludes  || '';
    this.outputProp = config.outputProp || 'payload';
    this.outputType = config.outputType || 'msg';
    this.twoOutputs = config.twoOutputs !== false;

    const node = this;

    if (!configNode) {
      setStatus(node, 'NO_KEY');
    } else {
      setStatus(node, 'IDLE');
    }

    node.on('input', async function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      // ── API key ──────────────────────────────────────────────────────────
      // Note: per the API docs, the bulk security endpoint requires an
      // apiKey and cannot be authenticated via Request Origin (CORS) —
      // unlike the single-IP /security endpoint.
      const apiKey = configNode && configNode.credentials
        ? configNode.credentials.apiKey : null;

      if (!apiKey) {
        setStatus(node, 'NO_KEY');
        const err = new IPGeoError('No API key configured', 'NO_API_KEY');
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      // ── Extract IP list from msg.payload ─────────────────────────────────
      let ips = msg.payload;

      // Support comma-separated string
      if (typeof ips === 'string') {
        ips = ips.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (!Array.isArray(ips) || ips.length === 0) {
        const err = new IPGeoError(
          'msg.payload must be a non-empty array of IPv4/IPv6 addresses or a comma-separated string',
          'INVALID_INPUT'
        );
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      if (ips.length > MAX_IPS) {
        const err = new IPGeoError(
          `Bulk security lookup limit is ${MAX_IPS} IPs per request; received ${ips.length}`,
          'TOO_MANY_IPS'
        );
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      // ── Build params ──────────────────────────────────────────────────────
      // The security-bulk endpoint only supports `fields` and `excludes`
      // (plus `output`, which we don't expose since the response is always
      // parsed as JSON). There is no `include` and no `lang` here.
      const params = buildCommonParams(apiKey, {
        fields:   node.fields,
        excludes: node.excludes,
      });

      setStatus(node, 'WORKING');

      try {
        const { data, credits } = await request({
          method: 'POST',
          path:   '/security-bulk',
          params,
          data:   { ips },
          // Bulk requests can be large — give them extra time
          timeout: 30_000,
        });

        // Each entry is either { ip, security: {...} } for a valid IP, or
        // { message: '...' } for a bogon/private/malformed entry. Count the
        // latter so the user gets the same signal the API otherwise conveys
        // via the (conditionally-present) X-Successful-Record header.
        const invalidEntries = Array.isArray(data)
          ? data.filter((entry) => entry && typeof entry === 'object' && !('security' in entry))
          : [];

        const validCount = Array.isArray(data) ? data.length - invalidEntries.length : ips.length;

        setStatus(node, 'OK', invalidEntries.length > 0
          ? `${validCount}/${ips.length} valid`
          : `${ips.length} IPs`);

        setOutputProperty(RED, node, msg,
          { value: node.outputProp, type: node.outputType }, data);

        if (credits !== null) msg.ipgeo_credits = credits;

        if (invalidEntries.length > 0) {
          msg.ipgeo_invalid_count = invalidEntries.length;
          msg.ipgeo_invalid_messages = invalidEntries.map((entry) => entry.message);
        } else {
          delete msg.ipgeo_invalid_count;
          delete msg.ipgeo_invalid_messages;
        }

        delete msg.error;

        send(node.twoOutputs ? [msg, null] : msg);
        if (done) done();

      } catch (err) {
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
      }
    });

    node.on('close', () => setStatus(node, 'IDLE'));
  }

  RED.nodes.registerType('ipgeo-bulk-security', IPGeoBulkSecurityNode);

};