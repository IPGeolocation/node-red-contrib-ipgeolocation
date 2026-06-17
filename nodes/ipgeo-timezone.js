/**
 * ipgeo-timezone.js
 *
 * Node-RED node: "ipgeo timezone"
 *
 * Timezone lookup via /v3/timezone supporting all input modes:
 *   tz      — IANA timezone name  (e.g. "America/New_York")
 *   ip      — IPv4 or IPv6 address
 *   location— Free-text address   (e.g. "New York, USA")
 *   coords  — Latitude + Longitude
 *   iata    — IATA airport code   (e.g. "JFK")
 *   icao    — ICAO airport code   (e.g. "KJFK")
 *   unlocode— UN/LOCODE           (e.g. "USNYC")
 *
 * Each input mode is selectable in the editor. The dynamic input
 * value can be sourced from the node config (static) or msg properties.
 */

'use strict';

const { request, IPGeoError } = require('./lib/api-client');
const {
  setStatus,
  resolveValue,
  setOutputProperty,
  handleNodeError,
} = require('./lib/node-helpers');

// Mapping from editor lookup-mode to API query parameter name
const MODE_PARAM = {
  tz:       'tz',
  ip:       'ip',
  location: 'location',
  coords:   null,          // lat + lng are separate params
  iata:     'iata',
  icao:     'icao',
  unlocode: 'location',    // UN/LO code is passed as 'location'
};

module.exports = function (RED) {

  function IPGeoTimezoneNode(config) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.server);

    this.name        = config.name;
    this.mode        = config.mode        || 'tz';    // lookup mode
    this.inputType   = config.inputType   || 'str';   // msg | str | flow | global
    this.inputValue  = config.inputValue  || '';
    this.latType     = config.latType     || 'str';
    this.latValue    = config.latValue    || '';
    this.lngType     = config.lngType     || 'str';
    this.lngValue    = config.lngValue    || '';
    this.outputProp  = config.outputProp  || 'payload';
    this.outputType  = config.outputType  || 'msg';
    this.twoOutputs  = config.twoOutputs  !== false;

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

      // ── Build query params ─────────────────────────────────────────────
      const params = { apiKey };
      const mode   = node.mode;

      try {
        if (mode === 'coords') {
          // Latitude & Longitude — two separate resolved values
          const lat = resolveValue(RED, node, msg,
            { value: node.latValue, type: node.latType });
          const lng = resolveValue(RED, node, msg,
            { value: node.lngValue, type: node.lngType });

          if (lat === undefined || lat === null || lat === '') {
            throw new IPGeoError('Latitude is required for coords mode', 'INVALID_INPUT');
          }
          if (lng === undefined || lng === null || lng === '') {
            throw new IPGeoError('Longitude is required for coords mode', 'INVALID_INPUT');
          }

          params.lat = lat;
          params.long = lng;

        } else {
          // Single-value modes
          const paramKey = MODE_PARAM[mode];
          if (!paramKey) {
            throw new IPGeoError(`Unknown lookup mode: ${mode}`, 'INVALID_MODE');
          }

          const inputVal = resolveValue(RED, node, msg,
            { value: node.inputValue, type: node.inputType });

          if (!inputVal && inputVal !== 0) {
            throw new IPGeoError(`Input value is empty for mode "${mode}"`, 'INVALID_INPUT');
          }

          params[paramKey] = String(inputVal).trim();
        }
      } catch (err) {
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      setStatus(node, 'WORKING');

      try {
        const { data, credits } = await request({
          method: 'GET',
          path:   '/timezone',
          params,
        });

        const tzName = (data.time_zone && data.time_zone.name) || 'ok';
        setStatus(node, 'OK', tzName);

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

  RED.nodes.registerType('ipgeo-timezone', IPGeoTimezoneNode);

};
