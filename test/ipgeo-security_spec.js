/**
 * test/ipgeo-security_spec.js  —  GET /v3/security (single-IP threat lookup)
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup, should,
} = require('./_setup');

const securityNode = require('../nodes/ipgeo-security.js');
const MODULES = [configNode, securityNode];

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-security', name: 'security', server: CONFIG_ID,
      ipType: 'str', ipValue: '', wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-security node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('looks up an IP on /security and returns the threat data', function (done) {
    let q;
    nock(API_HOST).get('/v3/security')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '1.2.3.4', security: { threat_score: 80, is_tor: true } },
             { 'x-credits-charged': '2' });

    helper.load(MODULES, flow({ ipValue: '1.2.3.4' }), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          q.ip.should.equal('1.2.3.4');
          msg.payload.security.threat_score.should.equal(80);
          msg.ipgeo_credits.should.equal(2);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('does not send lang or include params (unsupported by /security)', function (done) {
    let q;
    nock(API_HOST).get('/v3/security')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '1.2.3.4', security: {} });

    helper.load(MODULES, flow({ ipValue: '1.2.3.4' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try {
          should(q).not.have.property('lang');
          should(q).not.have.property('include');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('routes an API 403 to the error output as FORBIDDEN', function (done) {
    nock(API_HOST).get('/v3/security').query(true).reply(403, { message: 'plan limit' });
    helper.load(MODULES, flow({ ipValue: '1.2.3.4' }), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('FORBIDDEN'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });
});
