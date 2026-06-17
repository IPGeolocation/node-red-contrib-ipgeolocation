/**
 * ipgeo-config.js
 *
 * Configuration node — stores the IPGeolocation.io API key as a credential.
 * All functional nodes reference this config node so a single key change
 * propagates everywhere instantly.
 *
 * The config node is intentionally minimal; it is a shared credential
 * container with no input/output behaviour of its own.
 */

'use strict';

module.exports = function (RED) {

  function IPGeoConfigNode(n) {
    RED.nodes.createNode(this, n);
    // 'name' is stored as a plain property (safe to export in flows)
    this.name = n.name;
    // 'apiKey' is stored as a credential (never exported in flow JSON)
    // Access via: this.credentials.apiKey
  }

  RED.nodes.registerType('ipgeo-config', IPGeoConfigNode, {
    credentials: {
      apiKey: { type: 'password' },
    },
  });

};
