/**
 * node-red-contrib-ipgeolocation
 * Entry point — registers all nodes with the Node-RED runtime.
 *
 * Note: Node-RED loads nodes from the `node-red.nodes` map in package.json,
 * so this file is primarily a convenience for `require()`-ing the package
 * directly (e.g. in tests). It must stay in sync with package.json.
 */
'use strict';

module.exports = function (RED) {
  require('./nodes/ipgeo-config')(RED);
  require('./nodes/ipgeo-lookup')(RED);
  require('./nodes/ipgeo-bulk')(RED);
  require('./nodes/ipgeo-security')(RED);
  require('./nodes/ipgeo-bulk-security')(RED);
  require('./nodes/ipgeo-abuse')(RED);
  require('./nodes/ipgeo-asn')(RED);
  require('./nodes/ipgeo-timezone')(RED);
  require('./nodes/ipgeo-astronomy')(RED);
  require('./nodes/ipgeo-useragent')(RED);
};
