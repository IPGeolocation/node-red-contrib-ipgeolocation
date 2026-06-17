/**
 * test/ipgeo-abuse_spec.js  —  GET /v3/abuse (abuse-contact lookup)
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup,
} = require('./_setup');

const node = require('../nodes/ipgeo-abuse.js');
const MODULES = [configNode, node];

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-abuse', name: 'abuse', server: CONFIG_ID,
      ipType: 'str', ipValue: '', wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-abuse node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('looks up abuse contacts for an IP on /abuse', function (done) {
    let q;
    nock(API_HOST).get('/v3/abuse')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '1.2.3.4', abuse: { organization: 'Example ISP', emails: ['abuse@x.com'] } },
             { 'x-credits-charged': '1' });

    helper.load(MODULES, flow({ ipValue: '1.2.3.4' }), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          q.ip.should.equal('1.2.3.4');
          msg.payload.abuse.organization.should.equal('Example ISP');
          msg.ipgeo_credits.should.equal(1);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('reads the IP dynamically from a msg property', function (done) {
    let q;
    nock(API_HOST).get('/v3/abuse')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '9.9.9.9', abuse: {} });

    helper.load(MODULES, flow({ ipType: 'msg', ipValue: 'clientIp' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try { q.ip.should.equal('9.9.9.9'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ clientIp: '9.9.9.9' });
    });
  });

  it('surfaces an API 401 as AUTH_FAILED', function (done) {
    nock(API_HOST).get('/v3/abuse').query(true).reply(401, { message: 'bad key' });
    helper.load(MODULES, flow({ ipValue: '1.2.3.4' }), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('AUTH_FAILED'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });
});
