/**
 * test/ipgeo-lookup_spec.js  —  GET /v3/ipgeo (single IP / domain geolocation)
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup,
} = require('./_setup');

const lookupNode = require('../nodes/ipgeo-lookup.js');
const MODULES = [configNode, lookupNode];

/** Build a [config, lookup, success-helper, error-helper] flow. */
function flow(props = {}) {
  return [
    makeConfig(),
    {
      id: 'n1', type: 'ipgeo-lookup', name: 'lookup', server: CONFIG_ID,
      ipType: 'str', ipValue: '', wires: [['ok'], ['err']], ...props,
    },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-lookup node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('loads with its name and two outputs', function (done) {
    helper.load(MODULES, flow(), CREDS, function () {
      const n1 = helper.getNode('n1');
      n1.should.have.property('name', 'lookup');
      n1.should.have.property('twoOutputs', true);
      done();
    });
  });

  it('looks up an IP and writes the result to msg.payload', function (done) {
    let q;
    nock(API_HOST).get('/v3/ipgeo')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '8.8.8.8', location: { city: 'Mountain View' } },
             { 'x-credits-charged': '1' });

    helper.load(MODULES, flow({ ipType: 'msg', ipValue: 'payload' }), CREDS, function () {
      const ok = helper.getNode('ok');
      ok.on('input', (msg) => {
        try {
          q.apiKey.should.equal('TEST_KEY');
          q.ip.should.equal('8.8.8.8');
          msg.payload.location.city.should.equal('Mountain View');
          msg.ipgeo_credits.should.equal(1);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ payload: '8.8.8.8' });
    });
  });

  it('sends the configured include list and language', function (done) {
    let q;
    nock(API_HOST).get('/v3/ipgeo')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '8.8.8.8' });

    helper.load(MODULES, flow({ ipValue: '8.8.8.8', include: 'security,abuse', lang: 'de' }),
      CREDS, function () {
        helper.getNode('ok').on('input', () => {
          try {
            q.include.should.equal('security,abuse');
            q.lang.should.equal('de');
            done();
          } catch (e) { done(e); }
        });
        helper.getNode('n1').receive({});
      });
  });

  it('lets msg.ipgeo_include override the configured include list', function (done) {
    let q;
    nock(API_HOST).get('/v3/ipgeo')
      .query((query) => { q = query; return true; })
      .reply(200, { ip: '8.8.8.8' });

    helper.load(MODULES, flow({ ipValue: '8.8.8.8', include: 'security' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try { q.include.should.equal('abuse'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({ ipgeo_include: 'abuse' });
    });
  });

  it('emits NO_API_KEY on the error output when no key is configured', function (done) {
    helper.load(MODULES, flow({ ipValue: '8.8.8.8' }), {}, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('NO_API_KEY'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('routes an API 401 to the error output as AUTH_FAILED', function (done) {
    nock(API_HOST).get('/v3/ipgeo').query(true)
      .reply(401, { message: 'Invalid key' });

    helper.load(MODULES, flow({ ipValue: '8.8.8.8' }), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try {
          msg.error.code.should.equal('AUTH_FAILED');
          msg.error.status.should.equal(401);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('emits a single (un-wrapped) message when the error output is disabled', function (done) {
    nock(API_HOST).get('/v3/ipgeo').query(true).reply(200, { ip: '1.1.1.1' });
    const f = flow({ ipValue: '1.1.1.1', twoOutputs: false });
    f[1].wires = [['ok']];
    helper.load(MODULES, f, CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try { msg.payload.ip.should.equal('1.1.1.1'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });
});
