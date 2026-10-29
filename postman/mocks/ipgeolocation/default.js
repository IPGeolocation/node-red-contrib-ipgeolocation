'use strict';

const http = require('node:http');
const counts = new Map();

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const reply = (status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(data));
  };
  const key = url.searchParams.get('apiKey');
  const scenario = key?.split(':')[0];
  if (!['/v3/ipgeo', '/v3/ipgeo-bulk'].includes(url.pathname)) {
    return reply(501, { message: 'Endpoint not modeled' });
  }
  if (!['TEST_KEY', 'BAD_KEY', 'RATE_RETRY', 'SERVER_RETRY', 'SLOW', 'REDIRECT', 'REDIRECT_TARGET'].includes(scenario)) {
    return reply(401, { message: 'Invalid API key' });
  }
  if (scenario === 'BAD_KEY') return reply(401, { message: 'Invalid API key' });
  const countKey = `ipgeolocation:${key}`;
  const count = (counts.get(countKey) || 0) + 1;
  counts.set(countKey, count);
  if (scenario === 'RATE_RETRY' && count === 1) {
    return reply(429, { message: 'Too many requests' }, { 'Retry-After': '1' });
  }
  if (scenario === 'SERVER_RETRY' && count === 1) return reply(503, { message: 'Unavailable' });
  if (scenario === 'SLOW') {
    return setTimeout(() => {
      if (!res.destroyed) reply(200, { ip: '1.1.1.1' });
    }, 250);
  }
  if (scenario === 'REDIRECT') {
    return reply(302, {}, {
      Location: 'https://redirect.ipgeolocation.test/v3/ipgeo?apiKey=REDIRECT_TARGET&ip=1.1.1.1&fields=ip',
    });
  }
  if (scenario === 'REDIRECT_TARGET' && (req.headers.authorization || req.headers.cookie)) {
    return reply(400, { message: 'Credentials were forwarded to another origin' });
  }
  if (url.pathname === '/v3/ipgeo-bulk') {
    if (req.method !== 'POST' || !Array.isArray(req.body?.ips)) {
      return reply(400, { message: 'Expected a POST with an ips array' });
    }
    return reply(200, req.body.ips.map((ip) => ({ ip })), { 'X-Credits-Charged': '2' });
  }
  if (req.method !== 'GET') return reply(400, { message: 'Expected a GET' });
  if (!key || url.searchParams.get('fields') !== 'ip') {
    return reply(400, { message: 'Expected the test API key and fields=ip' });
  }
  reply(200, { ip: url.searchParams.get('ip') }, { 'X-Credits-Charged': '1' });
}).listen(process.env.PORT || 4500);
