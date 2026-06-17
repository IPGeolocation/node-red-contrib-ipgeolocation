/**
 * test/ipgeo-asn_spec.js  —  GET /v3/asn (ASN lookup by caller IP / IP / ASN)
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup, should,
} = require('./_setup');

const node = require('../nodes/ipgeo-asn.js');
const MODULES = [configNode, node];

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-asn', name: 'asn', server: CONFIG_ID,
      queryType: 'auto', ipType: 'str', ipValue: '', asnType: 'str', asnValue: '',
      wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-asn node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('auto mode sends neither ip nor asn (caller-IP lookup)', function (done) {
    let q;
    nock(API_HOST).get('/v3/asn')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '8.8.8.8', asn: { as_number: 'AS15169' } });

    helper.load(MODULES, flow({ queryType: 'auto' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try {
          should(q).not.have.property('ip');
          should(q).not.have.property('asn');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('ip mode sends the ip parameter', function (done) {
    let q;
    nock(API_HOST).get('/v3/asn')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '1.2.3.4', asn: {} });

    helper.load(MODULES, flow({ queryType: 'ip', ipValue: '1.2.3.4' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try { q.ip.should.equal('1.2.3.4'); should(q).not.have.property('asn'); done(); }
        catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('asn mode strips an "AS" prefix and sends the bare number', function (done) {
    let q;
    nock(API_HOST).get('/v3/asn')
      .query((query) => { q = query; return true; })
      .reply(200, { asn: { as_number: 'AS15169' } });

    helper.load(MODULES, flow({ queryType: 'asn', asnValue: 'AS15169', include: 'peers' }),
      CREDS, function () {
        helper.getNode('ok').on('input', () => {
          try {
            q.asn.should.equal('15169');
            q.include.should.equal('peers');
            done();
          } catch (e) { done(e); }
        });
        helper.getNode('n1').receive({});
      });
  });

  it('routes an API 404 to the error output as NOT_FOUND', function (done) {
    nock(API_HOST).get('/v3/asn').query(true).reply(404, { message: 'no such asn' });
    helper.load(MODULES, flow({ queryType: 'asn', asnValue: '99999999' }), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('NOT_FOUND'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });
});
