/**
 * test/_setup.js
 *
 * Shared test harness for the node-red-contrib-ipgeolocation spec files.
 *
 * Exposes:
 *   • helper      — the initialised node-red-node-test-helper
 *   • nock        — the HTTP mocking library
 *   • API_HOST    — base host used by every interceptor
 *   • configNode  — the ipgeo-config module (required by every functional spec)
 *   • CREDS       — standard credentials object keyed by the config node id
 *   • CONFIG_ID   — the id used for the config node in test flows
 *   • makeConfig  — builds a config-node flow entry (with a name that does NOT
 *                   collide with any node id — Node-RED treats a config-node
 *                   property whose value equals a node id as a dependency, so a
 *                   self-named config node trips a "circular dependency" error)
 *   • startServer / stopServer / cleanup — lifecycle helpers
 *
 * All HTTP traffic is intercepted with nock; no test ever contacts the real
 * IPGeolocation.io API. nock.disableNetConnect() guarantees a forgotten
 * interceptor fails loudly instead of leaking a live request.
 */

'use strict';

const helper = require('node-red-node-test-helper');
const nock = require('nock');
const should = require('should');

const configNode = require('../nodes/ipgeo-config.js');

const API_HOST  = 'https://api.ipgeolocation.io';
const CONFIG_ID = 'cfg';
const API_KEY   = 'TEST_KEY';
const CREDS     = { [CONFIG_ID]: { apiKey: API_KEY } };

helper.init(require.resolve('node-red'));

/** A config-node flow entry. Name deliberately differs from every node id. */
function makeConfig(extra = {}) {
  return { id: CONFIG_ID, type: 'ipgeo-config', name: 'My API Key', ...extra };
}

function startServer() {
  nock.disableNetConnect();
  return helper.startServer();
}

function stopServer() {
  nock.enableNetConnect();
  return helper.stopServer();
}

function cleanup() {
  helper.unload();
  nock.cleanAll();
}

module.exports = {
  helper,
  nock,
  API_HOST,
  API_KEY,
  CONFIG_ID,
  CREDS,
  configNode,
  makeConfig,
  startServer,
  stopServer,
  cleanup,
  should,
};
