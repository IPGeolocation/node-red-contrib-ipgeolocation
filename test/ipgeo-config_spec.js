/**
 * test/ipgeo-config_spec.js
 *
 * The config node is a credential container with no runtime behaviour, so the
 * tests confirm it loads, keeps its name, and exposes the API key as a
 * credential (never as a plain property).
 */

'use strict';

const { helper, configNode, startServer, stopServer, cleanup } = require('./_setup');

describe('ipgeo-config node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('loads with the configured name', function (done) {
    const flow = [{ id: 'c1', type: 'ipgeo-config', name: 'My Key' }];
    helper.load(configNode, flow, { c1: { apiKey: 'ABC' } }, function () {
      const c1 = helper.getNode('c1');
      c1.should.have.property('name', 'My Key');
      done();
    });
  });

  it('stores the API key as a credential, not a plain property', function (done) {
    const flow = [{ id: 'c1', type: 'ipgeo-config', name: 'My Key' }];
    helper.load(configNode, flow, { c1: { apiKey: 'SECRET' } }, function () {
      const c1 = helper.getNode('c1');
      c1.credentials.apiKey.should.equal('SECRET');
      c1.should.not.have.property('apiKey');
      done();
    });
  });
});
