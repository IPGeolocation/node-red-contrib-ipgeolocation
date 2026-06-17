/**
 * test/node-helpers_spec.js
 *
 * Unit tests for the shared helper functions (nodes/lib/node-helpers.js).
 * These functions are pure / lightly-stubbed and do not need the Node-RED
 * runtime, so they are tested directly with small fakes for `RED` and `node`.
 */

'use strict';

require('should');

const {
  STATUS,
  setStatus,
  clearStatus,
  resolveValue,
  setOutputProperty,
  handleNodeError,
  buildCommonParams,
} = require('../nodes/lib/node-helpers');

// ── Fakes ──────────────────────────────────────────────────────────────────

function fakeNode() {
  const flowStore = {};
  const globalStore = {};
  return {
    statuses: [],
    errors: [],
    status(s) { this.statuses.push(s); },
    error(msg) { this.errors.push(msg); },
    context() {
      return {
        flow:   { get: (k) => flowStore[k],   set: (k, v) => { flowStore[k] = v; } },
        global: { get: (k) => globalStore[k], set: (k, v) => { globalStore[k] = v; } },
      };
    },
  };
}

// Minimal RED.util implementation used by resolveValue / setOutputProperty.
const RED = {
  util: {
    getMessageProperty: (msg, path) =>
      path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), msg),
    setMessageProperty: (msg, path, val) => {
      const keys = path.split('.');
      const last = keys.pop();
      const target = keys.reduce((o, k) => (o[k] = o[k] || {}), msg);
      target[last] = val;
    },
  },
};

// ── buildCommonParams ────────────────────────────────────────────────────────

describe('node-helpers.buildCommonParams', function () {
  it('always includes the apiKey', function () {
    buildCommonParams('K', {}).should.deepEqual({ apiKey: 'K' });
  });

  it('omits lang when it is the default "en"', function () {
    buildCommonParams('K', { lang: 'en' }).should.not.have.property('lang');
  });

  it('includes a non-default lang', function () {
    buildCommonParams('K', { lang: 'de' }).lang.should.equal('de');
  });

  it('omits output when it is the default "json"', function () {
    buildCommonParams('K', { output: 'json' }).should.not.have.property('output');
  });

  it('trims and includes fields / excludes when present', function () {
    const p = buildCommonParams('K', { fields: ' a,b ', excludes: ' c ' });
    p.fields.should.equal('a,b');
    p.excludes.should.equal('c');
  });

  it('omits blank fields / excludes', function () {
    const p = buildCommonParams('K', { fields: '   ', excludes: '' });
    p.should.not.have.property('fields');
    p.should.not.have.property('excludes');
  });
});

// ── resolveValue ─────────────────────────────────────────────────────────────

describe('node-helpers.resolveValue', function () {
  const node = fakeNode();
  const msg = { payload: 'hi', nested: { ip: '8.8.8.8' } };

  it('reads a msg property by dotted path', function () {
    resolveValue(RED, node, msg, { value: 'nested.ip', type: 'msg' }).should.equal('8.8.8.8');
  });

  it('coerces str / num / bool / json', function () {
    resolveValue(RED, node, msg, { value: '42', type: 'str' }).should.equal('42');
    resolveValue(RED, node, msg, { value: '42', type: 'num' }).should.equal(42);
    resolveValue(RED, node, msg, { value: 'true', type: 'bool' }).should.equal(true);
    resolveValue(RED, node, msg, { value: '{"a":1}', type: 'json' }).should.deepEqual({ a: 1 });
  });

  it('returns undefined for malformed json', function () {
    (resolveValue(RED, node, msg, { value: '{bad', type: 'json' }) === undefined).should.be.true();
  });

  it('reads flow and global context', function () {
    node.context().flow.set('f', 'FV');
    node.context().global.set('g', 'GV');
    resolveValue(RED, node, msg, { value: 'f', type: 'flow' }).should.equal('FV');
    resolveValue(RED, node, msg, { value: 'g', type: 'global' }).should.equal('GV');
  });

  it('returns undefined for a null descriptor', function () {
    (resolveValue(RED, node, msg, undefined) === undefined).should.be.true();
  });
});

// ── setOutputProperty ────────────────────────────────────────────────────────

describe('node-helpers.setOutputProperty', function () {
  it('writes to a msg path', function () {
    const node = fakeNode();
    const msg = {};
    setOutputProperty(RED, node, msg, { value: 'result.data', type: 'msg' }, 99);
    msg.result.data.should.equal(99);
  });

  it('writes to flow and global context', function () {
    const node = fakeNode();
    const msg = {};
    setOutputProperty(RED, node, msg, { value: 'k', type: 'flow' }, 'FV');
    setOutputProperty(RED, node, msg, { value: 'k', type: 'global' }, 'GV');
    node.context().flow.get('k').should.equal('FV');
    node.context().global.get('k').should.equal('GV');
  });
});

// ── setStatus / clearStatus ──────────────────────────────────────────────────

describe('node-helpers.setStatus', function () {
  it('applies a named status from the STATUS table', function () {
    const node = fakeNode();
    setStatus(node, 'OK');
    node.statuses[0].should.deepEqual(STATUS.OK);
  });

  it('overrides the text via the suffix argument', function () {
    const node = fakeNode();
    setStatus(node, 'OK', 'Paris');
    node.statuses[0].text.should.equal('Paris');
    node.statuses[0].fill.should.equal('green');
  });

  it('passes a raw status object straight through', function () {
    const node = fakeNode();
    setStatus(node, { fill: 'blue', shape: 'dot', text: 'x' });
    node.statuses[0].should.deepEqual({ fill: 'blue', shape: 'dot', text: 'x' });
  });

  it('clearStatus emits an empty object', function () {
    const node = fakeNode();
    clearStatus(node);
    node.statuses[0].should.deepEqual({});
  });
});

// ── handleNodeError ──────────────────────────────────────────────────────────

describe('node-helpers.handleNodeError', function () {
  it('attaches structured error metadata to msg.error', function () {
    const node = fakeNode();
    const msg = {};
    const err = Object.assign(new Error('bad key'), { code: 'AUTH_FAILED', status: 401 });
    handleNodeError(node, err, msg, () => {}, () => {}, false);
    msg.error.code.should.equal('AUTH_FAILED');
    msg.error.status.should.equal(401);
    msg.error.message.should.equal('bad key');
  });

  it('calls done(err) when no second output is used', function (done) {
    const node = fakeNode();
    const err = Object.assign(new Error('x'), { code: 'BAD_REQUEST' });
    handleNodeError(node, err, {}, (e) => {
      e.should.equal(err);
      done();
    }, () => {}, false);
  });

  it('routes to the second output when twoOutputs is true', function () {
    const node = fakeNode();
    let sent;
    const send = (arr) => { sent = arr; };
    let doneCalled = false;
    const err = Object.assign(new Error('x'), { code: 'BAD_REQUEST' });
    handleNodeError(node, err, { a: 1 }, () => { doneCalled = true; }, send, true);
    sent[0] === null && sent[1].error.code.should.equal('BAD_REQUEST');
    doneCalled.should.be.true();
  });

  it('shows a rate-limited status for RATE_LIMITED errors', function () {
    const node = fakeNode();
    const err = Object.assign(new Error('x'), { code: 'RATE_LIMITED' });
    handleNodeError(node, err, {}, () => {}, () => {}, false);
    node.statuses[0].should.deepEqual(STATUS.RATE_LIM);
  });
});
