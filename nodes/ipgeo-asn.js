/**
 * ipgeo-asn.js
 *
 * Node-RED node: "ipgeo asn"
 *
 * Performs an ASN (Autonomous System Number) lookup via the
 * IPGeolocation.io /v3/asn endpoint (GET).
 *
 * Unlike the other ipgeo-* nodes, this endpoint accepts EITHER an `ip`
 * OR an `asn` query parameter (mutually exclusive) — or neither, in
 * which case the API auto-detects the caller's IP and returns ASN data
 * for it.
 *
 * Features
 * ─────────
 *  • Query mode: auto-detect caller IP | lookup by IP | lookup by ASN
 *  • Configurable `include` modules: peers, downstreams, upstreams,
 *    routes, whois_response  (comma-separated)
 *  • `fields` and `excludes` for bandwidth optimisation
 *  • IP/ASN value can be sourced from node config OR msg/flow/global property
 *  • Two outputs: [success, error] — error output is optional
 *  • Exposes credits consumed on msg.ipgeo_credits (flat 1 credit/lookup)
 *  • Full retry + exponential backoff via shared api-client
 *
 * Shares the same `ipgeo-config` config node (API key) as the other
 * ipgeo-* nodes.
 */

"use strict";

const { request, IPGeoError } = require("./lib/api-client");
const {
  setStatus,
  resolveValue,
  setOutputProperty,
  handleNodeError,
  buildCommonParams,
} = require("./lib/node-helpers");

module.exports = function (RED) {
  function IPGeoASNNode(config) {
    RED.nodes.createNode(this, config);

    // ── Config node (API key) ─────────────────────────────────────────────
    const configNode = RED.nodes.getNode(config.server);

    // ── Node configuration ────────────────────────────────────────────────
    this.name = config.name;
    this.queryType = config.queryType || "auto"; // 'auto' | 'ip' | 'asn'
    this.ipType = config.ipType || "str"; // 'str' | 'msg' | 'flow' | 'global'
    this.ipValue = config.ipValue || "";
    this.asnType = config.asnType || "str"; // 'str' | 'msg' | 'flow' | 'global'
    this.asnValue = config.asnValue || "";
    this.include = config.include || ""; // comma-sep list of modules
    this.fields = config.fields || "";
    this.excludes = config.excludes || "";
    this.outputProp = config.outputProp || "payload"; // output property
    this.outputType = config.outputType || "msg";
    this.twoOutputs = config.twoOutputs !== false; // default true

    const node = this;

    // ── Pre-flight: warn if no config node ───────────────────────────────
    if (!configNode) {
      setStatus(node, "NO_KEY");
      node.warn(
        "No IPGeolocation.io config node selected — configure an API key first."
      );
    } else {
      setStatus(node, "IDLE");
    }

    // ── Input handler ─────────────────────────────────────────────────────
    node.on("input", async function (msg, send, done) {
      // Node-RED 0.x compat
      send =
        send ||
        function () {
          node.send.apply(node, arguments);
        };

      // ── Validate API key availability ─────────────────────────────────
      const apiKey =
        configNode && configNode.credentials
          ? configNode.credentials.apiKey
          : null;

      if (!apiKey) {
        setStatus(node, "NO_KEY");
        const err = new IPGeoError("No API key configured", "NO_API_KEY");
        handleNodeError(node, err, msg, done, send, node.twoOutputs);
        return;
      }

      // ── Resolve ip / asn depending on the selected query mode ─────────
      // Only one of ip/asn is ever sent. If queryType is 'auto', neither
      // is sent and the API auto-detects the caller's IP.
      let ip = "";
      let asn = "";

      if (node.queryType === "ip") {
        if (
          node.ipType === "msg" ||
          node.ipType === "flow" ||
          node.ipType === "global"
        ) {
          ip =
            resolveValue(RED, node, msg, {
              value: node.ipValue,
              type: node.ipType,
            }) || "";
        } else {
          ip = (node.ipValue || "").trim();
        }
        ip = String(ip).trim();
      } else if (node.queryType === "asn") {
        if (
          node.asnType === "msg" ||
          node.asnType === "flow" ||
          node.asnType === "global"
        ) {
          asn =
            resolveValue(RED, node, msg, {
              value: node.asnValue,
              type: node.asnType,
            }) || "";
        } else {
          asn = (node.asnValue || "").trim();
        }
        // Accept "AS24940" or "24940" — API expects the bare number.
        asn = String(asn).trim().replace(/^as/i, "").trim();
      }
      // 'auto' — leave both ip and asn unset; caller IP is used.

      // ── Build query parameters ────────────────────────────────────────
      // ASN endpoint has no `lang` param — apiKey / ip|asn / include /
      // fields / excludes.
      const params = buildCommonParams(apiKey, {
        fields: node.fields,
        excludes: node.excludes,
      });

      if (ip) params.ip = ip;
      if (asn) params.asn = asn;

      // Build include list (may come from node config or msg override)
      const includeList = (msg.ipgeo_include || node.include || "").trim();
      if (includeList) params.include = includeList;

      // ── Set working status ────────────────────────────────────────────
      setStatus(node, "WORKING");

      // ── API call ──────────────────────────────────────────────────────
      try {
        const { data, credits } = await request({
          method: "GET",
          path: "/asn",
          params,
        });

        // ── Success ────────────────────────────────────────────────────
        setStatus(
          node,
          "OK",
          data.asn?.as_number || data.asn?.organization || data.ip || "ok"
        );

        // Write result to configured output property
        setOutputProperty(
          RED,
          node,
          msg,
          { value: node.outputProp, type: node.outputType },
          data
        );

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
    node.on("close", function () {
      setStatus(node, "IDLE");
    });
  }

  RED.nodes.registerType("ipgeo-asn", IPGeoASNNode);
};
