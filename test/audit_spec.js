'use strict';

const assert = require('node:assert/strict');
const { checkAudit } = require('../scripts/audit');

const report = (vulnerabilities) => ({
  metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } }, vulnerabilities,
});
const finding = () => ({
  severity: 'moderate', nodes: ['node_modules/npm/node_modules/ip-address'],
  via: [{ url: 'https://github.com/advisories/GHSA-rxp7-6hxx-x8q5' }],
});
const lock = () => ({ packages: {
  'node_modules/npm': { version: '11.21.1', dev: true },
  'node_modules/npm/node_modules/ip-address': { dev: true, inBundle: true },
} });

describe('dependency audit policy', function () {
  it('accepts a clean audit', function () {
    assert.deepEqual(checkAudit(report({}), lock()), []);
  });

  it('reports only the exact known development bundle separately', function () {
    assert.deepEqual(checkAudit(report({ 'ip-address': finding() }), lock()), []);
  });

  it('rejects a production copy or a copy outside npm', function () {
    const production = lock(); production.packages['node_modules/npm'].dev = false;
    assert.equal(checkAudit(report({ 'ip-address': finding() }), production).length, 1);
    const outside = finding(); outside.nodes = ['node_modules/ip-address'];
    assert.equal(checkAudit(report({ 'ip-address': outside }), lock()).length, 1);
  });

  it('rejects a newly added advisory', function () {
    const changed = finding(); changed.via.push({ url: 'https://github.com/advisories/new' });
    assert.equal(checkAudit(report({ 'ip-address': changed }), lock()).length, 1);
  });

  it('rejects an increased severity', function () {
    const changed = finding(); changed.severity = 'critical';
    assert.equal(checkAudit(report({ 'ip-address': changed }), lock()).length, 1);
  });

  it('requires another review when the bundled npm version changes', function () {
    const changed = lock(); changed.packages['node_modules/npm'].version = '12.2.1';
    assert.equal(checkAudit(report({ 'ip-address': finding() }), changed).length, 1);
  });

  it('rejects a different affected dependency', function () {
    assert.equal(checkAudit(report({ axios: finding() }), lock()).length, 1);
  });

  it('recognizes parent reports only when every cause is an accepted development finding', function () {
    const parent = { severity: 'moderate', nodes: ['node_modules/npm'], via: ['ip-address'] };
    assert.deepEqual(checkAudit(report({ npm: parent, 'ip-address': finding() }), lock()), []);
    parent.via.push({ url: 'https://github.com/advisories/new' });
    assert.equal(checkAudit(report({ npm: parent, 'ip-address': finding() }), lock()).length, 1);
  });

  it('rejects circular or production parent reports', function () {
    const parent = { severity: 'moderate', nodes: ['node_modules/npm'], via: ['npm'] };
    assert.equal(checkAudit(report({ npm: parent }), lock()).length, 1);
    parent.via = ['ip-address'];
    const production = lock(); production.packages['node_modules/npm'].dev = false;
    assert.equal(checkAudit(report({ npm: parent, 'ip-address': finding() }), production).length, 2);
    assert.equal(checkAudit(report({ npm: { ...parent, nodes: [] }, 'ip-address': finding() }), lock()).length, 1);
  });

  it('fails on missing, inconsistent or failed audit data', function () {
    assert.throws(() => checkAudit({}, lock()), /complete report/);
    assert.throws(() => checkAudit({ error: { code: 'NETWORK' } }, lock()), /complete report/);
    assert.throws(() => checkAudit({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {} }, lock()), /complete report/);
  });
});
