/**
 * test/ipgeo-bulk_spec.js  —  POST /v3/ipgeo-bulk (bulk geolocation)
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup,
} = require('./_setup');

const bulkNode = require('../nodes/ipgeo-bulk.js');
const MODULES = [configNode, bulkNode];

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-bulk', name: 'bulk', server: CONFIG_ID,
      wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-bulk node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('posts an array of IPs and returns the result array', function (done) {
    let body;
    nock(API_HOST).post('/v3/ipgeo-bulk', (b) => { body = b; return true; })
      .query(true)
      .reply(200, [{ ip: '8.8.8.8' }, { ip: '1.1.1.1' }], { 'x-credits-charged': '2' });

    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          body.ips.should.deepEqual(['8.8.8.8', '1.1.1.1']);
          msg.payload.length.should.equal(2);
          msg.ipgeo_credits.should.equal(2);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ payload: ['8.8.8.8', '1.1.1.1'] });
    });
  });

  it('auto-splits a comma-separated string payload', function (done) {
    let body;
    nock(API_HOST).post('/v3/ipgeo-bulk', (b) => { body = b; return true; })
      .query(true).reply(200, [{ ip: '8.8.8.8' }, { ip: '1.1.1.1' }]);

    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try { body.ips.should.deepEqual(['8.8.8.8', '1.1.1.1']); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ payload: '8.8.8.8, 1.1.1.1' });
    });
  });

  it('rejects a non-array / empty payload with INVALID_INPUT', function (done) {
    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('INVALID_INPUT'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ payload: {} });
    });
  });

  it('rejects more than 50,000 IPs with TOO_MANY_IPS', function (done) {
    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('TOO_MANY_IPS'); done(); } catch (e) { done(e); }
      });
      const tooMany = new Array(50001).fill('8.8.8.8');
      helper.getNode('n1').receive({ payload: tooMany });
    });
  });
});
