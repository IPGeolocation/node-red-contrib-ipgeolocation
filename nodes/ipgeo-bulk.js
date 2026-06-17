/**
 * ipgeo-bulk.js
 *
 * Node-RED node: "ipgeo bulk"
 *
 * Performs bulk geolocation lookups via the IPGeolocation.io
 * /v3/ipgeo-bulk endpoint (POST).
 *
 * Input
 * ─────
 *  msg.payload  — Array of IP strings / domains  (required)
 *               OR a comma-separated string which is auto-split
 *
 * Configuration
 * ─────────────
 *  • Same include/fields/excludes/lang options as the single lookup node
 *  • Max 50,000 IPs per request (per API limits)
 *  • Each result corresponds to one IP in the input array
 *    (invalid IPs return { message: '...' } objects per API spec)
 *
 * Output
 * ──────
 *  msg.payload  — Array of geolocation result objects
 *  msg.ipgeo_credits  — Credits consumed (from response header)
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

  function IPGeoBulkNode(config) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.server);

    this.name       = config.name;
    this.include    = config.include   || '';
    this.fields     = config.fields    || '';
    this.excludes   = config.excludes  || '';
    this.lang       = config.lang      || 'en';
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
          'msg.payload must be a non-empty array of IP addresses or a comma-separated string',
          'INVALID_INPUT'
        );
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      if (ips.length > MAX_IPS) {
        const err = new IPGeoError(
          `Bulk lookup limit is ${MAX_IPS} IPs per request; received ${ips.length}`,
          'TOO_MANY_IPS'
        );
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      // ── Build params ──────────────────────────────────────────────────────
      const params = buildCommonParams(apiKey, {
        lang:     node.lang,
        fields:   node.fields,
        excludes: node.excludes,
      });

      const includeList = (msg.ipgeo_include || node.include || '').trim();
      if (includeList) params.include = includeList;

      setStatus(node, 'WORKING');

      try {
        const { data, credits } = await request({
          method: 'POST',
          path:   '/ipgeo-bulk',
          params,
          data:   { ips },
          // Bulk requests can be large — give them extra time
          timeout: 30_000,
        });

        setStatus(node, 'OK', `${ips.length} IPs`);

        setOutputProperty(RED, node, msg,
          { value: node.outputProp, type: node.outputType }, data);

        if (credits !== null) msg.ipgeo_credits = credits;
        delete msg.error;

        send(node.twoOutputs ? [msg, null] : msg);
        if (done) done();

      } catch (err) {
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
      }
    });

    node.on('close', () => setStatus(node, 'IDLE'));
  }

  RED.nodes.registerType('ipgeo-bulk', IPGeoBulkNode);

};
