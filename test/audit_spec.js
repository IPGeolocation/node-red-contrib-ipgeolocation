'use strict';

const assert = require('node:assert/strict');
const { checkAudit } = require('../scripts/audit');

const report = (vulnerabilities) => ({
  metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } }, vulnerabilities,
});
const finding = () => ({
  severity: 'moderate', nodes: ['node_modules/npm/node_modules/glob'],
  via: [{ url: 'https://github.com/advisories/GHSA-3g3m-2fjr-6pw4' }],
});
const lock = () => ({ packages: {
  'node_modules/npm': { version: '11.21.2', dev: true },
  'node_modules/npm/node_modules/glob': { version: '13.0.6', dev: true, inBundle: true },
} });

describe('dependency audit policy', function () {
  it('accepts a clean audit', function () {
    assert.deepEqual(checkAudit(report({}), lock()), []);
  });

  it('reports only the exact known development bundle separately', function () {
    assert.deepEqual(checkAudit(report({ glob: finding() }), lock()), []);
  });

  it('rejects a production copy or a copy outside npm', function () {
    const production = lock(); production.packages['node_modules/npm'].dev = false;
    assert.equal(checkAudit(report({ glob: finding() }), production).length, 1);
    const outside = finding(); outside.nodes = ['node_modules/glob'];
    assert.equal(checkAudit(report({ glob: outside }), lock()).length, 1);
  });

  it('rejects a newly added advisory', function () {
    const changed = finding(); changed.via.push({ url: 'https://github.com/advisories/new' });
    assert.equal(checkAudit(report({ glob: changed }), lock()).length, 1);
  });

  it('rejects an increased severity', function () {
    const changed = finding(); changed.severity = 'critical';
    assert.equal(checkAudit(report({ glob: changed }), lock()).length, 1);
  });

  it('requires another review when the bundled npm version changes', function () {
    const changed = lock(); changed.packages['node_modules/npm'].version = '12.2.1';
    assert.equal(checkAudit(report({ glob: finding() }), changed).length, 1);
  });

  it('rejects an unreviewed version of a bundled library', function () {
    const changed = lock(); changed.packages['node_modules/npm/node_modules/glob'].version = '13.0.5';
    assert.equal(checkAudit(report({ glob: finding() }), changed).length, 1);
  });

  it('rejects a different affected dependency', function () {
    assert.equal(checkAudit(report({ axios: finding() }), lock()).length, 1);
  });

  it('rejects warnings for dependencies already patched in npm', function () {
    for (const [name, severity, id] of [
      ['ip-address', 'moderate', 'GHSA-rxp7-6hxx-x8q5'],
      ['undici', 'high', 'GHSA-2m5v-pch6-74hx'],
    ]) {
      const bundled = lock();
      const location = `node_modules/npm/node_modules/${name}`;
      bundled.packages[location] = { dev: true, inBundle: true };
      const changed = { severity, nodes: [location],
        via: [{ url: `https://github.com/advisories/${id}` }] };
      assert.equal(checkAudit(report({ [name]: changed }), bundled).length, 1);
    }
  });

  it('recognizes parent reports only when every cause is an accepted development finding', function () {
    const parent = { severity: 'moderate', nodes: ['node_modules/npm'], via: ['glob'] };
    assert.deepEqual(checkAudit(report({ npm: parent, glob: finding() }), lock()), []);
    parent.via.push({ url: 'https://github.com/advisories/new' });
    assert.equal(checkAudit(report({ npm: parent, glob: finding() }), lock()).length, 1);
  });

  it('accepts a known bundled finding whose other causes are accepted bundled findings', function () {
    const bundled = lock();
    bundled.packages['node_modules/npm/node_modules/glob'] = { version: '13.0.6', dev: true, inBundle: true };
    bundled.packages['node_modules/npm/node_modules/minimatch'] = { version: '10.2.5', dev: true, inBundle: true };
    const minimatch = { severity: 'moderate', nodes: ['node_modules/npm/node_modules/minimatch'],
      via: [{ url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249' }] };
    const glob = { severity: 'moderate', nodes: ['node_modules/npm/node_modules/glob'],
      via: [{ url: 'https://github.com/advisories/GHSA-3g3m-2fjr-6pw4' }, 'minimatch'] };
    assert.deepEqual(checkAudit(report({ glob, minimatch }), bundled), []);
    const axios = { severity: 'moderate', nodes: ['node_modules/axios'], via: [{ url: 'https://github.com/advisories/new' }] };
    glob.via[1] = 'axios';
    assert.equal(checkAudit(report({ glob, minimatch, axios }), bundled).length, 2);
  });

  it('rejects circular or production parent reports', function () {
    const parent = { severity: 'moderate', nodes: ['node_modules/npm'], via: ['npm'] };
    assert.equal(checkAudit(report({ npm: parent }), lock()).length, 1);
    parent.via = ['glob'];
    const production = lock(); production.packages['node_modules/npm'].dev = false;
    assert.equal(checkAudit(report({ npm: parent, glob: finding() }), production).length, 2);
    assert.equal(checkAudit(report({ npm: { ...parent, nodes: [] }, glob: finding() }), lock()).length, 1);
  });

  it('fails on missing, inconsistent or failed audit data', function () {
    assert.throws(() => checkAudit({}, lock()), /complete report/);
    assert.throws(() => checkAudit({ error: { code: 'NETWORK' } }, lock()), /complete report/);
    assert.throws(() => checkAudit({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {} }, lock()), /complete report/);
  });
});
