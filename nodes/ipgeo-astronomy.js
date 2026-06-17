/**
 * ipgeo-astronomy.js
 *
 * Node-RED node: "ipgeo astronomy"
 *
 * Fetches sun & moon rise/set times and positional data via the
 * IPGeolocation.io /v3/astronomy endpoint.
 *
 * Input modes (the API derives the location from one of these)
 * ────────────────────────────────────────────────────────────
 *  auto      — send no location parameter; the API uses the caller's IP
 *  coords    — latitude + longitude (lat / long)
 *  location  — a free-text address, preferably a city (location)
 *  ip        — an IPv4 or IPv6 address (ip)
 *
 * Per the API: if several location parameters are present, lat/long win,
 * then location, then ip; with none, the caller's IP is used.
 *
 * Optional inputs (any mode)
 * ──────────────────────────
 *  date       — "YYYY-MM-DD"; defaults to today at the location
 *  time_zone  — IANA timezone name; event times are converted to it
 *  elevation  — metres above sea level (0 to 10000); default 0
 *  lang       — response language for the location object (paid plans)
 *
 * Every value can be static (node config) or sourced dynamically from
 * msg / flow / global context.
 */

'use strict';

const { request, IPGeoError } = require('./lib/api-client');
const {
  setStatus,
  resolveValue,
  setOutputProperty,
  handleNodeError,
} = require('./lib/node-helpers');

// Editor mode -> single-value query parameter name. 'coords' is handled
// separately because it maps to two parameters (lat + long); 'auto' sends
// no location parameter at all.
const MODE_PARAM = {
  auto:     null,
  coords:   null,
  location: 'location',
  ip:       'ip',
};

module.exports = function (RED) {

  function IPGeoAstronomyNode(config) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.server);

    this.name        = config.name;
    this.mode        = config.mode        || 'coords'; // auto | coords | location | ip
    this.inputType   = config.inputType   || 'str';    // for location / ip modes
    this.inputValue  = config.inputValue  || '';
    this.latType     = config.latType     || 'str';
    this.latValue    = config.latValue    || '';
    this.lngType     = config.lngType     || 'str';
    this.lngValue    = config.lngValue    || '';
    this.dateType    = config.dateType    || 'str';
    this.dateValue   = config.dateValue   || '';   // empty = API default (today)
    this.tzType      = config.tzType      || 'str';
    this.tzValue     = config.tzValue     || '';   // empty = API determines tz
    this.elevationType  = config.elevationType  || 'str';
    this.elevationValue = config.elevationValue || ''; // empty = API default (0)
    this.langType    = config.langType    || 'str';
    this.langValue   = config.langValue   || '';   // empty = API default (en)
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

      const params = { apiKey };
      const mode   = node.mode;

      try {
        if (mode === 'coords') {
          const lat = resolveValue(RED, node, msg,
            { value: node.latValue, type: node.latType });
          const lng = resolveValue(RED, node, msg,
            { value: node.lngValue, type: node.lngType });

          if (lat === undefined || lat === null || String(lat).trim() === '') {
            throw new IPGeoError('Latitude is required for coords mode', 'INVALID_INPUT');
          }
          if (lng === undefined || lng === null || String(lng).trim() === '') {
            throw new IPGeoError('Longitude is required for coords mode', 'INVALID_INPUT');
          }

          params.lat  = String(lat).trim();
          params.long = String(lng).trim();

        } else if (mode === 'location' || mode === 'ip') {
          const paramKey  = MODE_PARAM[mode];
          const inputVal  = resolveValue(RED, node, msg,
            { value: node.inputValue, type: node.inputType });

          if (!inputVal && inputVal !== 0) {
            throw new IPGeoError(`Input value is empty for mode "${mode}"`, 'INVALID_INPUT');
          }

          params[paramKey] = String(inputVal).trim();

        } else if (mode !== 'auto') {
          throw new IPGeoError(`Unknown lookup mode: ${mode}`, 'INVALID_MODE');
        }
        // 'auto' sends no location parameter; the API falls back to the caller IP.
      } catch (err) {
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      // ── Optional parameters (all modes) ───────────────────────────────
      const date = resolveValue(RED, node, msg,
        { value: node.dateValue, type: node.dateType });
      if (date && String(date).trim()) {
        params.date = String(date).trim();
      }

      const tz = resolveValue(RED, node, msg,
        { value: node.tzValue, type: node.tzType });
      if (tz && String(tz).trim()) {
        params.time_zone = String(tz).trim();
      }

      const elevation = resolveValue(RED, node, msg,
        { value: node.elevationValue, type: node.elevationType });
      if (elevation !== undefined && elevation !== null && String(elevation).trim() !== '') {
        params.elevation = String(elevation).trim();
      }

      const lang = resolveValue(RED, node, msg,
        { value: node.langValue, type: node.langType });
      if (lang && String(lang).trim()) {
        params.lang = String(lang).trim();
      }

      setStatus(node, 'WORKING');

      try {
        const { data, credits } = await request({
          method: 'GET',
          path:   '/astronomy',
          params,
        });

        // The response nests the data under an `astronomy` object.
        const sunrise = data && data.astronomy ? data.astronomy.sunrise : undefined;
        setStatus(node, 'OK', sunrise ? `sunrise ${sunrise}` : 'ok');

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

  RED.nodes.registerType('ipgeo-astronomy', IPGeoAstronomyNode);

};
