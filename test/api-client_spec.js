/**
 * test/api-client_spec.js
 *
 * Unit tests for the shared Axios HTTP client (nodes/lib/api-client.js).
 * Exercises success parsing, credit extraction, error mapping for every
 * handled status code, retry/back-off behaviour and network-error mapping.
 *
 * All requests are intercepted by nock; `maxRetries: 0` is used wherever we
 * only care about the mapped error so the suite stays fast.
 */

'use strict';

const nock = require('nock');
const assert = require('node:assert/strict');
require('should');

const { request, IPGeoError, BASE_URL } = require('../nodes/lib/api-client');

const HOST = 'https://api.ipgeolocation.io';

describe('lib/api-client', function () {

  before(() => nock.disableNetConnect());
  after(() => nock.enableNetConnect());
  afterEach(() => nock.cleanAll());

  it('exposes the v3 base URL', function () {
    BASE_URL.should.equal('https://api.ipgeolocation.io/v3');
  });

  describe('successful responses', function () {
    it('returns parsed data on 200', async function () {
      nock(HOST).get('/v3/ipgeo').query(true).reply(200, { ip: '1.1.1.1' });
      const { data } = await request({ method: 'GET', path: '/ipgeo' });
      data.ip.should.equal('1.1.1.1');
    });

    it('extracts credits from the x-credits-charged header', async function () {
      nock(HOST).get('/v3/ipgeo').query(true)
        .reply(200, { ip: '1.1.1.1' }, { 'x-credits-charged': '3' });
      const { credits } = await request({ method: 'GET', path: '/ipgeo' });
      credits.should.equal(3);
    });

    it('returns null credits when the header is absent', async function () {
      nock(HOST).get('/v3/ipgeo').query(true).reply(200, { ip: '1.1.1.1' });
      const { credits } = await request({ method: 'GET', path: '/ipgeo' });
      (credits === null).should.be.true();
    });

    it('sends a JSON body on POST', async function () {
      let received;
      nock(HOST).post('/v3/ipgeo-bulk', (body) => { received = body; return true; })
        .query(true).reply(200, [{ ip: '1.1.1.1' }]);
      await request({ method: 'POST', path: '/ipgeo-bulk', data: { ips: ['1.1.1.1'] } });
      received.should.deepEqual({ ips: ['1.1.1.1'] });
    });
  });

  describe('error mapping', function () {
    const cases = [
      [400, 'BAD_REQUEST'],
      [401, 'AUTH_FAILED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [422, 'VALIDATION'],
      [423, 'LOCKED'],
    ];

    cases.forEach(([status, code]) => {
      it(`maps HTTP ${status} to ${code}`, async function () {
        nock(HOST).get('/v3/ipgeo').query(true)
          .reply(status, { message: 'boom' });
        try {
          await request({ method: 'GET', path: '/ipgeo', maxRetries: 0 });
          throw new Error('should have thrown');
        } catch (err) {
          err.should.be.instanceof(IPGeoError);
          err.code.should.equal(code);
          err.status.should.equal(status);
          err.body.should.deepEqual({ message: 'boom' });
        }
      });
    });

    it('maps HTTP 429 to RATE_LIMITED (retries disabled)', async function () {
      nock(HOST).get('/v3/ipgeo').query(true).reply(429, { message: 'slow down' });
      try {
        await request({ method: 'GET', path: '/ipgeo', maxRetries: 0 });
        throw new Error('should have thrown');
      } catch (err) {
        err.code.should.equal('RATE_LIMITED');
        err.status.should.equal(429);
      }
    });

    it('maps an unknown status to HTTP_ERROR', async function () {
      nock(HOST).get('/v3/ipgeo').query(true).reply(418, { message: 'teapot' });
      try {
        await request({ method: 'GET', path: '/ipgeo', maxRetries: 0 });
        throw new Error('should have thrown');
      } catch (err) {
        err.code.should.equal('HTTP_ERROR');
        err.status.should.equal(418);
      }
    });

    it('maps a DNS/network failure to NETWORK_ERROR', async function () {
      nock(HOST).get('/v3/ipgeo').query(true).replyWithError({ code: 'ENOTFOUND' });
      try {
        await request({ method: 'GET', path: '/ipgeo', maxRetries: 0 });
        throw new Error('should have thrown');
      } catch (err) {
        err.code.should.equal('NETWORK_ERROR');
      }
    });
  });

  describe('redirect behaviour', function () {
    it('keeps relative redirects on the API server working', async function () {
      nock(HOST).get('/v3/ipgeo').query(true)
        .reply(302, {}, { location: '/v3/lookup-result' });
      nock(HOST).get('/v3/lookup-result')
        .reply(200, { ip: '1.1.1.1' }, { 'x-credits-charged': '1' });

      const result = await request({ path: '/ipgeo', params: { apiKey: 'TEST_KEY' } });
      result.should.deepEqual({ data: { ip: '1.1.1.1' }, credits: 1 });
    });

    it('preserves a bulk body on a same-server 307 redirect', async function () {
      const data = { ips: ['8.8.8.8', '2001:4860:4860::8888', '8.8.8.8'] };
      nock(HOST).post('/v3/ipgeo-bulk', data).query(true)
        .reply(307, {}, { location: '/v3/bulk-result' });
      const target = nock(HOST).post('/v3/bulk-result', data)
        .reply(200, data.ips.map((ip) => ({ ip })));

      const result = await request({ method: 'POST', path: '/ipgeo-bulk', data });
      result.data.should.deepEqual(data.ips.map((ip) => ({ ip })));
      target.isDone().should.be.true();
    });

    it('blocks redirects that change protocol, host or port before sending data', async function () {
      const data = { ips: ['8.8.8.8', '2001:4860:4860::8888', '8.8.8.8'] };
      for (const [status, destination, method] of [
        [302, 'https://redirect.ipgeolocation.test', 'GET'],
        [307, 'https://redirect.ipgeolocation.test', 'POST'],
        [308, 'https://redirect.ipgeolocation.test', 'POST'],
        [302, 'http://api.ipgeolocation.io', 'GET'],
        [307, 'https://api.ipgeolocation.io:8443', 'POST'],
      ]) {
        const path = method === 'POST' ? '/ipgeo-bulk' : '/ipgeo';
        nock(HOST)[method.toLowerCase()](`/v3${path}`).query(true)
          .reply(status, {}, { location: `${destination}/target` });
        const target = nock(destination)[method.toLowerCase()]('/target')
          .reply(200, { unexpected: true });

        await assert.rejects(request({
          method, path, data: method === 'POST' ? data : undefined,
          params: { apiKey: 'TEST_KEY' },
          headers: { 'X-Workflow-Header': 'test-only-value' },
        }), (err) => err instanceof IPGeoError && err.code === 'REQUEST_ERROR' &&
          err.message === 'Request redirect was blocked.');
        target.isDone().should.be.false();
      }
    });
  });

  describe('retry behaviour', function () {
    it('retries a transient 5xx then succeeds', async function () {
      this.timeout(5000);
      nock(HOST).get('/v3/ipgeo').query(true).reply(503, { message: 'unavailable' });
      nock(HOST).get('/v3/ipgeo').query(true).reply(200, { ip: '9.9.9.9' });
      const { data } = await request({ method: 'GET', path: '/ipgeo' });
      data.ip.should.equal('9.9.9.9');
    });

    it('gives up after maxRetries and throws the mapped error', async function () {
      this.timeout(5000);
      nock(HOST).get('/v3/ipgeo').query(true).times(2).reply(500, { message: 'down' });
      try {
        await request({ method: 'GET', path: '/ipgeo', maxRetries: 1 });
        throw new Error('should have thrown');
      } catch (err) {
        err.code.should.equal('SERVER_ERROR');
        err.status.should.equal(500);
      }
    });

    it('does not retry a 429, since no credits are left', async function () {
      const scope = nock(HOST).get('/v3/ipgeo').query(true)
        .reply(429, { message: 'no credits' }, { 'retry-after': '1' });
      try {
        await request({ method: 'GET', path: '/ipgeo', maxRetries: 3 });
        throw new Error('should have thrown');
      } catch (err) {
        err.code.should.equal('RATE_LIMITED');
      }
      scope.isDone().should.be.true();
    });
  });
});
