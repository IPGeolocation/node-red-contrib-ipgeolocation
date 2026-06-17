/**
 * test/ipgeo-timezone_spec.js  —  GET /v3/timezone (multi-mode lookup)
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup,
} = require('./_setup');

const node = require('../nodes/ipgeo-timezone.js');
const MODULES = [configNode, node];

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-timezone', name: 'tz', server: CONFIG_ID,
      mode: 'tz', inputType: 'str', inputValue: '',
      latType: 'str', latValue: '', lngType: 'str', lngValue: '',
      wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

describe('ipgeo-timezone node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('tz mode sends the tz parameter', function (done) {
    let q;
    nock(API_HOST).get('/v3/timezone')
      .query((query) => { q = query; return true; })
      .reply(200, { time_zone: { name: 'America/New_York' } });

    helper.load(MODULES, flow({ mode: 'tz', inputValue: 'America/New_York' }), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          q.tz.should.equal('America/New_York');
          msg.payload.time_zone.name.should.equal('America/New_York');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('coords mode sends lat and long parameters', function (done) {
    let q;
    nock(API_HOST).get('/v3/timezone')
      .query((query) => { q = query; return true; })
      .reply(200, { time_zone: { name: 'Europe/Paris' } });

    helper.load(MODULES, flow({ mode: 'coords', latValue: '48.85', lngValue: '2.35' }),
      CREDS, function () {
        helper.getNode('ok').on('input', () => {
          try { q.lat.should.equal('48.85'); q.long.should.equal('2.35'); done(); }
          catch (e) { done(e); }
        });
        helper.getNode('n1').receive({});
      });
  });

  it('iata mode sends the iata parameter', function (done) {
    let q;
    nock(API_HOST).get('/v3/timezone')
      .query((query) => { q = query; return true; })
      .reply(200, { time_zone: { name: 'Europe/Paris' } });

    helper.load(MODULES, flow({ mode: 'iata', inputValue: 'CDG' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try { q.iata.should.equal('CDG'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('unlocode mode is sent via the location parameter', function (done) {
    let q;
    nock(API_HOST).get('/v3/timezone')
      .query((query) => { q = query; return true; })
      .reply(200, { time_zone: { name: 'Europe/Paris' } });

    helper.load(MODULES, flow({ mode: 'unlocode', inputValue: 'FRPAR' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try { q.location.should.equal('FRPAR'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('reports INVALID_INPUT when a single-value mode has no input', function (done) {
    helper.load(MODULES, flow({ mode: 'tz', inputValue: '' }), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('INVALID_INPUT'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('reports INVALID_INPUT when coords mode is missing latitude', function (done) {
    helper.load(MODULES, flow({ mode: 'coords', latValue: '', lngValue: '2.35' }),
      CREDS, function () {
        helper.getNode('err').on('input', (msg) => {
          try { msg.error.code.should.equal('INVALID_INPUT'); done(); } catch (e) { done(e); }
        });
        helper.getNode('n1').receive({});
      });
  });
});
