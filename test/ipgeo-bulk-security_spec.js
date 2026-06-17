/**
 * test/ipgeo-bulk-security_spec.js  —  POST /v3/security-bulk
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup,
} = require('./_setup');

const node = require('../nodes/ipgeo-bulk-security.js');
const MODULES = [configNode, node];

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-bulk-security', name: 'bulk-sec', server: CONFIG_ID,
      wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-bulk-security node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('posts IPs to /security-bulk and returns the result array', function (done) {
    let body;
    nock(API_HOST).post('/v3/security-bulk', (b) => { body = b; return true; })
      .query(true)
      .reply(200, [{ ip: '1.2.3.4', security: { threat_score: 0 } },
                   { ip: '5.6.7.8', security: { threat_score: 90 } }]);

    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          body.ips.should.deepEqual(['1.2.3.4', '5.6.7.8']);
          msg.payload.length.should.equal(2);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ payload: ['1.2.3.4', '5.6.7.8'] });
    });
  });

  it('counts entries that came back without a security object', function (done) {
    nock(API_HOST).post('/v3/security-bulk').query(true)
      .reply(200, [{ ip: '1.2.3.4', security: {} },
                   { message: '10.0.0.1 is a private IP' }]);

    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          msg.ipgeo_invalid_count.should.equal(1);
          msg.ipgeo_invalid_messages.should.deepEqual(['10.0.0.1 is a private IP']);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ payload: ['1.2.3.4', '10.0.0.1'] });
    });
  });

  it('rejects an empty payload with INVALID_INPUT', function (done) {
    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('INVALID_INPUT'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ payload: [] });
    });
  });
});
