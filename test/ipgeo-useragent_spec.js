/**
 * test/ipgeo-useragent_spec.js  —  GET /v3/user-agent (UA string parsing)
 *
 * The node forwards the User-Agent value as the request's User-Agent *header*
 * (not a query param), so the tests assert on the header via matchHeader.
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup,
} = require('./_setup');

const node = require('../nodes/ipgeo-useragent.js');
const MODULES = [configNode, node];

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15';

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-useragent', name: 'ua', server: CONFIG_ID,
      uaType: 'msg', uaValue: 'req.headers.user-agent',
      wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-useragent node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('forwards the UA as a header and returns the parsed object', function (done) {
    let sentUA;
    nock(API_HOST, { reqheaders: { 'user-agent': (v) => { sentUA = v; return true; } } })
      .get('/v3/user-agent').query(true)
      .reply(200, { name: 'Safari', type: 'Browser', device: { name: 'iPhone' } });

    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          sentUA.should.equal(UA);
          msg.payload.name.should.equal('Safari');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ req: { headers: { 'user-agent': UA } } });
    });
  });

  it('reads a UA from a static string when uaType is str', function (done) {
    let sentUA;
    nock(API_HOST, { reqheaders: { 'user-agent': (v) => { sentUA = v; return true; } } })
      .get('/v3/user-agent').query(true)
      .reply(200, { name: 'Chrome' });

    helper.load(MODULES, flow({ uaType: 'str', uaValue: 'curl/8.0' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try { sentUA.should.equal('curl/8.0'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('reports INVALID_INPUT when no UA is found at the configured path', function (done) {
    helper.load(MODULES, flow(), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('INVALID_INPUT'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ req: { headers: {} } });
    });
  });
});
