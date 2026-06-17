/**
 * test/ipgeo-astronomy_spec.js  —  GET /v3/astronomy (sun & moon data)
 */

'use strict';

const {
  helper, nock, API_HOST, CONFIG_ID, CREDS,
  configNode, makeConfig, startServer, stopServer, cleanup, should,
} = require('./_setup');

const node = require('../nodes/ipgeo-astronomy.js');
const MODULES = [configNode, node];

function flow(props = {}) {
  return [
    makeConfig(),
    { id: 'n1', type: 'ipgeo-astronomy', name: 'astro', server: CONFIG_ID,
      mode: 'coords',
      inputType: 'str', inputValue: '',
      latType: 'str', latValue: '', lngType: 'str', lngValue: '',
      dateType: 'str', dateValue: '', tzType: 'str', tzValue: '',
      elevationType: 'str', elevationValue: '', langType: 'str', langValue: '',
      wires: [['ok'], ['err']], ...props },
    { id: 'ok', type: 'helper' },
    { id: 'err', type: 'helper' },
  ];
}

// A response shaped like the real API: data nested under `astronomy`.
function astroReply(extra = {}) {
  return Object.assign({
    location: { latitude: '51.5', longitude: '-0.12', city: 'London' },
    astronomy: {
      date: '2026-06-16', sunrise: '04:43', sunset: '21:21',
      solar_noon: '13:02', moon_phase: 'WANING_GIBBOUS',
    },
  }, extra);
}

describe('ipgeo-astronomy node', function () {
  before(startServer);
  after(stopServer);
  afterEach(cleanup);

  it('sends lat/long in coords mode and returns the astronomy block', function (done) {
    let q;
    nock(API_HOST).get('/v3/astronomy')
      .query((query) => { q = query; return true; })
      .reply(200, astroReply(), { 'x-credits-charged': '1' });

    helper.load(MODULES, flow({ latValue: '51.5', lngValue: '-0.12' }), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          q.lat.should.equal('51.5');
          q.long.should.equal('-0.12');
          should(q).not.have.property('location');
          should(q).not.have.property('ip');
          msg.payload.astronomy.sunrise.should.equal('04:43');
          msg.ipgeo_credits.should.equal(1);
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('sends the location parameter in location mode', function (done) {
    let q;
    nock(API_HOST).get('/v3/astronomy')
      .query((query) => { q = query; return true; })
      .reply(200, astroReply());

    helper.load(MODULES, flow({ mode: 'location', inputValue: 'New York, USA' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try {
          q.location.should.equal('New York, USA');
          should(q).not.have.property('lat');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('sends the ip parameter in ip mode', function (done) {
    let q;
    nock(API_HOST).get('/v3/astronomy')
      .query((query) => { q = query; return true; })
      .reply(200, astroReply({ ip: '8.8.8.8' }));

    helper.load(MODULES, flow({ mode: 'ip', inputValue: '8.8.8.8' }), CREDS, function () {
      helper.getNode('ok').on('input', (msg) => {
        try {
          q.ip.should.equal('8.8.8.8');
          msg.payload.ip.should.equal('8.8.8.8');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('sends no location parameter in auto (caller IP) mode', function (done) {
    let q;
    nock(API_HOST).get('/v3/astronomy')
      .query((query) => { q = query; return true; })
      .reply(200, astroReply());

    helper.load(MODULES, flow({ mode: 'auto' }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try {
          should(q).not.have.property('lat');
          should(q).not.have.property('location');
          should(q).not.have.property('ip');
          q.apiKey.should.equal('TEST_KEY');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('adds date, time_zone, elevation and lang when provided', function (done) {
    let q;
    nock(API_HOST).get('/v3/astronomy')
      .query((query) => { q = query; return true; })
      .reply(200, astroReply());

    helper.load(MODULES, flow({
      latValue: '51.5', lngValue: '-0.12',
      dateValue: '2026-12-25', tzValue: 'Europe/London',
      elevationValue: '10', langValue: 'de',
    }), CREDS, function () {
      helper.getNode('ok').on('input', () => {
        try {
          q.date.should.equal('2026-12-25');
          q.time_zone.should.equal('Europe/London');
          should(q).not.have.property('tz');
          q.elevation.should.equal('10');
          q.lang.should.equal('de');
          done();
        } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('reports INVALID_INPUT when latitude is missing in coords mode', function (done) {
    helper.load(MODULES, flow({ latValue: '', lngValue: '-0.12' }), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('INVALID_INPUT'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });

  it('reports INVALID_INPUT when the value is empty in location mode', function (done) {
    helper.load(MODULES, flow({ mode: 'location', inputValue: '' }), CREDS, function () {
      helper.getNode('err').on('input', (msg) => {
        try { msg.error.code.should.equal('INVALID_INPUT'); done(); } catch (e) { done(e); }
      });
      helper.getNode('n1').receive({});
    });
  });
});
