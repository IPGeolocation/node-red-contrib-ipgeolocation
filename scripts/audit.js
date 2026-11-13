'use strict';

const { spawnSync } = require('node:child_process');

const bundledFindings = {
  glob: { version: '13.0.6', severity: 'moderate', ids: ['GHSA-3g3m-2fjr-6pw4'] },
  minimatch: { version: '10.2.5', severity: 'moderate', ids: ['GHSA-g3hv-75wg-m249'] },
};

function isBundledDevelopmentFinding(name, report, lock, ancestors = []) {
  // shortcut: npm 11.21.2 still bundles these two affected development libraries; remove the exceptions when npm updates them.
  const finding = report.vulnerabilities[name];
  if (!finding || finding.severity === 'critical' || ancestors.includes(name) || finding.nodes.length === 0 ||
      !finding.nodes.every((node) => lock.packages[node]?.dev === true)) return false;
  if (finding.via.every((item) => typeof item === 'string')) {
    return finding.via.length > 0 && finding.via.every((child) =>
      isBundledDevelopmentFinding(child, report, lock, [...ancestors, name]));
  }
  const policy = bundledFindings[name];
  const location = `node_modules/npm/node_modules/${name}`;
  return policy && lock.packages['node_modules/npm']?.version === '11.21.2' &&
    lock.packages['node_modules/npm'].dev === true && lock.packages[location]?.dev === true &&
    lock.packages[location].inBundle === true && lock.packages[location].version === policy.version &&
    finding.severity === policy.severity &&
    finding.nodes.length === 1 && finding.nodes[0] === location && finding.via.length > 0 &&
    finding.via.every((item) => typeof item === 'string'
      ? isBundledDevelopmentFinding(item, report, lock, [...ancestors, name])
      : policy.ids.some((id) => item.url === `https://github.com/advisories/${id}`));
}

function checkAudit(report, lock) {
  if (report.error || !Number.isInteger(report.metadata?.vulnerabilities?.total) ||
      !report.vulnerabilities || Array.isArray(report.vulnerabilities) ||
      report.metadata.vulnerabilities.total !== Object.keys(report.vulnerabilities).length) {
    throw new Error('npm audit did not return a complete report');
  }
  return Object.entries(report.vulnerabilities).filter(([name]) =>
    !isBundledDevelopmentFinding(name, report, lock));
}

function audit(args) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json', ...args], {
    encoding: 'utf8',
  });
  if (result.error || ![0, 1].includes(result.status)) {
    throw result.error || new Error(result.stderr || 'npm audit failed');
  }
  return JSON.parse(result.stdout);
}

if (require.main === module) {
  try {
    const lock = require('../package-lock.json');
    const production = audit(['--omit=dev']);
    if (checkAudit(production, lock).length || production.metadata.vulnerabilities.total !== 0) {
      throw new Error('Production dependency audit failed');
    }
    console.log('Production dependency audit: 0 findings.');
    const full = audit([]);
    const unexpected = checkAudit(full, lock);
    console.log(`Full audit: ${full.metadata.vulnerabilities.total} findings, including affected parent packages.`);
    for (const name of Object.keys(bundledFindings)) {
      if (full.vulnerabilities[name]) console.log(`${name}: known npm development bundle; not a production dependency.`);
    }
    for (const [name, finding] of unexpected) console.error(`${name}: ${finding.severity}`, finding.via);
    if (unexpected.length) process.exitCode = 1;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = { checkAudit };
