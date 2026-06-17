/**
 * ipgeo-useragent.js
 *
 * Node-RED node: "ipgeo user-agent"
 *
 * Parses a User-Agent string via the IPGeolocation.io /v3/user-agent endpoint.
 *
 * Input
 * ─────
 *  User-Agent string can be sourced from:
 *    • Static string in the node config
 *    • A msg property (e.g. msg.req.headers['user-agent'])
 *    • An incoming HTTP request forwarded through Node-RED's HTTP-in node
 *
 * Output
 * ──────
 *  msg.payload  (or configured output property) — parsed UA object with:
 *    { user_agent_string, name, type, version, device, engine, operating_system }
 */

'use strict';

const { request, IPGeoError } = require('./lib/api-client');
const {
  setStatus,
  resolveValue,
  setOutputProperty,
  handleNodeError,
} = require('./lib/node-helpers');

module.exports = function (RED) {

  function IPGeoUserAgentNode(config) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.server);

    this.name        = config.name;
    this.uaType      = config.uaType     || 'msg';   // msg | str | flow | global
    this.uaValue     = config.uaValue    || 'req.headers.user-agent';
    this.outputProp  = config.outputProp || 'payload';
    this.outputType  = config.outputType || 'msg';
    this.twoOutputs  = config.twoOutputs !== false;

    const node = this;

    if (!configNode) {
      setStatus(node, 'NO_KEY');
    } else {
      setStatus(node, 'IDLE');
    }

    node.on('input', async function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      const apiKey = configNode && configNode.credentials
        ? configNode.credentials.apiKey : null;

      if (!apiKey) {
        setStatus(node, 'NO_KEY');
        const err = new IPGeoError('No API key configured', 'NO_API_KEY');
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      // ── Resolve UA string ─────────────────────────────────────────────
      const ua = resolveValue(RED, node, msg,
        { value: node.uaValue, type: node.uaType });

      if (!ua || String(ua).trim() === '') {
        const err = new IPGeoError(
          'User-Agent string is empty or not found at the configured path',
          'INVALID_INPUT'
        );
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      setStatus(node, 'WORKING');

      try {
        const { data, credits } = await request({
          method:  'GET',
          path:    '/user-agent',
          params:  { apiKey },
          headers: { 'User-Agent': String(ua).trim() },
        });

        setStatus(node, 'OK', data.name || 'parsed');

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

  RED.nodes.registerType('ipgeo-useragent', IPGeoUserAgentNode);

};
