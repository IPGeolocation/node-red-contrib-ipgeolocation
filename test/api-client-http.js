'use strict';

const assert = require('node:assert/strict');
const { request, IPGeoError } = require('../nodes/lib/api-client');

async function main() {
  assert.ok(process.env.HTTPS_PROXY && process.env.NODE_EXTRA_CA_CERTS,
    'Start the local Postman simulation and set HTTPS_PROXY and NODE_EXTRA_CA_CERTS');

  const params = { apiKey: 'TEST_KEY', ip: '1.1.1.1', fields: 'ip' };
  const runId = Date.now();
  const result = await request({ path: '/ipgeo', params, maxRetries: 0 });
  assert.deepEqual(result, { data: { ip: '1.1.1.1' }, credits: 1 });

  const ips = ['8.8.8.8', '2001:4860:4860::8888'];
  const bulk = await request({ method: 'POST', path: '/ipgeo-bulk', params: { apiKey: 'TEST_KEY', fields: 'ip' }, data: { ips }, maxRetries: 0 });
  assert.deepEqual(bulk, { data: ips.map((ip) => ({ ip })), credits: 2 });

  await assert.rejects(request({ path: '/ipgeo', params: { ...params, apiKey: 'BAD_KEY' }, maxRetries: 0 }),
    (err) => err instanceof IPGeoError && err.code === 'AUTH_FAILED' && err.status === 401);

  const started = Date.now();
  const rateLimited = await request({ path: '/ipgeo', params: { ...params, apiKey: `RATE_RETRY:${runId}` }, maxRetries: 1 });
  assert.equal(rateLimited.data.ip, '1.1.1.1');
  assert.ok(Date.now() - started >= 900, 'Retry-After must delay the retry');

  const retried = await request({ path: '/ipgeo', params: { ...params, apiKey: `SERVER_RETRY:${runId}` }, maxRetries: 1 });
  assert.equal(retried.data.ip, '1.1.1.1');

  await assert.rejects(request({ path: '/ipgeo', params: { ...params, apiKey: 'SLOW' }, timeout: 25, maxRetries: 0 }),
    (err) => err instanceof IPGeoError && err.code === 'TIMEOUT');

  const redirected = await request({
    path: '/ipgeo', params: { ...params, apiKey: 'REDIRECT' }, maxRetries: 0,
    headers: { Authorization: 'Bearer test-only-secret', Cookie: 'test-only-cookie' },
  });
  assert.deepEqual(redirected.data, { ip: '1.1.1.1' });
  console.log('7 HTTP integration checks passed: GET, POST, authentication, rate limiting, retries, timeout and redirect credential handling.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
