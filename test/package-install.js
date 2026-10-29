'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ipgeolocation-package-'));

function npm(args, cwd) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function manifest(cwd, dependency, overrides) {
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
    name: 'ipgeolocation-package-check', private: true, version: '1.0.0',
    dependencies: { [pkg.name]: dependency }, ...(overrides ? { overrides } : {}),
  }, null, 2));
}

function versions(cwd) {
  const consumer = createRequire(path.join(cwd, 'package.json'));
  const plugin = createRequire(consumer.resolve(`${pkg.name}/package.json`));
  const axiosPath = plugin.resolve('axios/package.json');
  return { consumer, plugin, axios: JSON.parse(fs.readFileSync(axiosPath, 'utf8')).version,
    redirects: JSON.parse(fs.readFileSync(createRequire(axiosPath).resolve('follow-redirects/package.json'), 'utf8')).version };
}

function verify(cwd, audit) {
  const resolved = versions(cwd);
  const [major, minor] = resolved.axios.split('.').map(Number);
  assert.ok(major === 1 && minor >= 21, `Unexpected Axios ${resolved.axios}`);
  const [rMajor, rMinor, rPatch] = resolved.redirects.split('.').map(Number);
  assert.ok(rMajor === 1 && (rMinor > 16 || (rMinor === 16 && rPatch >= 2)), `Unexpected follow-redirects ${resolved.redirects}`);
  const registrations = [];
  resolved.consumer(pkg.name)({ nodes: { registerType(name) { registrations.push(name); } } });
  assert.deepEqual(registrations.sort(), Object.keys(pkg['node-red'].nodes).sort());
  for (const file of Object.values(pkg['node-red'].nodes)) {
    assert.ok(fs.existsSync(resolved.plugin.resolve(`./${file.replace(/\.js$/, '.html')}`)));
  }
  if (audit) npm(['audit', '--omit=dev', '--json'], cwd);
  console.log(`Package loads all 10 nodes; Axios ${resolved.axios}, follow-redirects ${resolved.redirects}.`);
}

try {
  const packed = JSON.parse(npm(['pack', root, '--json', '--ignore-scripts'], temporary))[0];
  const archive = path.join(temporary, packed.filename);
  assert.ok(!packed.files.some((file) => /^(test|postman|scripts|\.github)\//.test(file.path)));
  const modern = Number(process.versions.node.split('.')[0]) >= 20;
  const fresh = path.join(temporary, 'fresh'); fs.mkdirSync(fresh);
  manifest(fresh, `file:${archive}`);
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], fresh);
  verify(fresh, modern);

  if (modern) {
    const upgrade = path.join(temporary, 'upgrade'); fs.mkdirSync(upgrade);
    manifest(upgrade, '1.0.1', { axios: '1.19.0', 'follow-redirects': '1.16.0' });
    npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], upgrade);
    assert.equal(versions(upgrade).axios, '1.19.0');
    assert.equal(versions(upgrade).redirects, '1.16.0');
    manifest(upgrade, `file:${archive}`);
    npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], upgrade);
    verify(upgrade, true);
    console.log('Upgrade from the older dependency tree passes the production audit.');
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
