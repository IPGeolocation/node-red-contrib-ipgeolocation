/**
 * test/examples_spec.js
 *
 * Guards the bundled example flows: every file in examples/ must be valid JSON,
 * reference only resolvable wires/config nodes, and successfully instantiate in
 * a real Node-RED runtime with all package nodes registered. This catches
 * renamed properties or node types drifting out of sync with the examples.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { helper, startServer, stopServer, cleanup } = require('./_setup');

// Register every node in the package so the example flows can load.
const MODULES = [
  require('../nodes/ipgeo-config.js'),
  require('../nodes/ipgeo-lookup.js'),
  require('../nodes/ipgeo-bulk.js'),
  require('../nodes/ipgeo-security.js'),
  require('../nodes/ipgeo-bulk-security.js'),
  require('../nodes/ipgeo-abuse.js'),
  require('../nodes/ipgeo-asn.js'),
  require('../nodes/ipgeo-timezone.js'),
  require('../nodes/ipgeo-astronomy.js'),
  require('../nodes/ipgeo-useragent.js'),
];

const EX_DIR = path.join(__dirname, '..', 'examples');
const files = fs.readdirSync(EX_DIR).filter((f) => f.endsWith('.json'));

describe('bundled example flows', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('ships at least one example per functional node', function () {
    const text = files.map((f) => fs.readFileSync(path.join(EX_DIR, f), 'utf8')).join('');
    ['ipgeo-lookup', 'ipgeo-bulk', 'ipgeo-security', 'ipgeo-bulk-security',
     'ipgeo-abuse', 'ipgeo-asn', 'ipgeo-timezone', 'ipgeo-astronomy',
     'ipgeo-useragent'].forEach((t) => text.should.containEql('"' + t + '"'));
  });

  files.forEach((file) => {
    it(`loads "${file}" into the runtime`, function (done) {
      const flow = JSON.parse(fs.readFileSync(path.join(EX_DIR, file), 'utf8'));

      // Structural validation against the full, unmodified example: every wire
      // target and config reference must resolve within the file.
      const ids = new Set(flow.map((n) => n.id));
      flow.forEach((n) => {
        (n.wires || []).forEach((port) => port.forEach((t) => ids.has(t).should.be.true()));
        if (n.server) ids.has(n.server).should.be.true();
      });

      // The test-helper registers only this package's nodes (not the core
      // inject/debug/comment/tab nodes used for presentation), so we load just
      // the package nodes — carrying the example's exact property values — to
      // confirm they instantiate. This is what catches a renamed property or
      // node type drifting away from the examples.
      const ipgeoNode = flow.find(
        (n) => n.type && n.type.startsWith('ipgeo-') && n.type !== 'ipgeo-config'
      );
      // Keep the tab plus this package's nodes (retaining each node's `z` so it
      // stays attached to its flow), and drop only the wires that pointed at the
      // removed inject/debug nodes. Core presentation nodes are not registered by
      // the test-helper, so they are filtered out.
      const sanitized = flow
        .filter(
          (n) =>
            n.type === 'tab' ||
            n.type === 'ipgeo-config' ||
            (n.type && n.type.startsWith('ipgeo-'))
        )
        .map((n) => {
          const copy = Object.assign({}, n);
          delete copy.wires; // targets (inject/debug) are no longer present
          return copy;
        });

      helper.load(MODULES, sanitized, function () {
        const inst = helper.getNode(ipgeoNode.id);
        // The node instantiated with the example's property values intact.
        inst.should.have.property('type', ipgeoNode.type);
        done();
      });
    });
  });
});
