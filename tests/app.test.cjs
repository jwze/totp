const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const OTPAuth = require('../js/otpauth-9.1.3.min.js');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const exampleSecret = 'JBSWY3DPEHPK3PXP';

function setup({ search = '', hash = '', timestamp = 59000 } = {}) {
  let options;
  let interval;
  let cleared;
  class ClipboardMock {
    constructor(selector, config) {
      this.selector = selector;
      this.config = config;
      this.handlers = {};
      this.destroyed = false;
    }
    on(name, handler) { this.handlers[name] = handler; }
    destroy() { this.destroyed = true; }
  }
  const context = vm.createContext({
    URLSearchParams,
    Date: class extends Date { static now() { return timestamp; } },
    OTPAuth,
    ClipboardJS: ClipboardMock,
    window: { location: { search, hash } },
    setInterval(callback) { interval = callback; return 42; },
    clearInterval(handle) { cleared = handle; },
    Vue: {
      markRaw(value) { return value; },
      createApp(value) { options = value; return { mount() {} }; },
    },
  });
  vm.runInContext(source, context);
  const state = options.data();
  for (const [name, method] of Object.entries(options.methods)) {
    state[name] = method.bind(state);
  }
  return {
    state,
    context,
    mount() { options.mounted.call(state); },
    unmount() { options.unmounted.call(state); },
    tick() { interval(); },
    get cleared() { return cleared; },
  };
}

test('empty startup does not generate a public demo token', () => {
  const app = setup();
  app.mount();
  assert.equal(app.state.secret_key, '');
  assert.equal(app.state.token, null);
  assert.equal(app.state.error, '');
  assert.equal(app.state.updatingIn, 0);
});

test('query values remain strings and malformed escapes do not crash parsing', () => {
  const { context } = setup();
  const params = context.parseURLSearch('?key=22222222&flag&digits=8&value=a%3Db&bad=%ZZ');
  assert.equal(params.key, '22222222');
  assert.equal(params.flag, '');
  assert.equal(params.digits, '8');
  assert.equal(params.value, 'a=b');
  assert.equal(params.bad, '%ZZ');
  assert.equal(Object.keys(context.parseURLSearch('')).length, 0);
});

test('plain, slash-prefixed and encoded hash keys work', () => {
  for (const hash of [`#${exampleSecret}`, `#/${exampleSecret}`, '#jbswy3dp%20ehpk3pxp']) {
    const app = setup({ hash });
    app.mount();
    assert.match(app.state.token, /^\d{6}$/);
    assert.equal(app.state.error, '');
  }
});

test('query key takes precedence over hash and accepts lowercase algorithm', () => {
  const app = setup({
    hash: '#INVALID!',
    search: `?key=${exampleSecret}&digits=8&period=60&algorithm=sha256`,
  });
  app.mount();
  assert.equal(app.state.secret_key, exampleSecret);
  assert.equal(app.state.algorithm, 'SHA256');
  assert.match(app.state.token, /^\d{8}$/);
  assert.equal(app.state.updatingIn, 1);
});

test('malformed hash and invalid Base32 produce errors instead of throwing', () => {
  for (const secret of ['%ZZ', 'INVALID!', 'A', 'ABC', 'ABCDEF', 'MY=', '========']) {
    const app = setup({ hash: `#${secret}` });
    assert.doesNotThrow(() => app.mount());
    assert.equal(app.state.token, null, secret);
    assert.ok(app.state.error, secret);
  }
});

test('padded Base32 is accepted', () => {
  const app = setup({ hash: '#MY======' });
  app.mount();
  assert.match(app.state.token, /^\d{6}$/);
});

test('invalid configuration is not silently replaced with defaults', () => {
  for (const query of [
    'digits=0', 'digits=9', 'digits=6.5', 'digits=', 'digits=abc',
    'period=0', 'period=-1', 'period=1.5', 'period=86401', 'period=Infinity',
    'algorithm=MD5', 'algorithm=',
  ]) {
    const app = setup({ search: `?key=${exampleSecret}&${query}` });
    app.mount();
    assert.equal(app.state.token, null, query);
    assert.ok(app.state.error, query);
    assert.equal(app.state.updatingIn, 0);
  }
});

test('valid input restores token after errors; clearing secret removes stale token', () => {
  const app = setup({ hash: `#${exampleSecret}` });
  app.mount();
  app.state.period = 0;
  app.state.update();
  assert.equal(app.state.token, null);
  assert.ok(app.state.error);
  app.state.period = 30;
  app.state.update();
  assert.match(app.state.token, /^\d{6}$/);
  assert.equal(app.state.error, '');
  app.state.secret_key = '';
  app.state.update();
  assert.equal(app.state.token, null);
  assert.equal(app.state.error, '');
});

// RFC 6238 Appendix B: all supported algorithms, six timestamps.
const vectors = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];
const seeds = [
  ['SHA1', '12345678901234567890'],
  ['SHA256', '12345678901234567890123456789012'],
  ['SHA512', '1234567890123456789012345678901234567890123456789012345678901234'],
];
for (const [seconds, ...expected] of vectors) {
  test(`RFC 6238 tokens at ${seconds} seconds`, () => {
    seeds.forEach(([algorithm, seed], index) => {
      const key = OTPAuth.Secret.fromUTF8(seed).base32;
      const app = setup({ timestamp: seconds * 1000, search: `?key=${key}&digits=8&algorithm=${algorithm}` });
      app.mount();
      assert.equal(app.state.token, expected[index], algorithm);
    });
  });
}

test('countdown and token share the same timestamp near period boundaries', () => {
  for (const [timestamp, remaining] of [[29999, 1], [30000, 30], [30501, 30], [59999, 1]]) {
    const app = setup({ timestamp, hash: `#${exampleSecret}` });
    app.mount();
    assert.equal(app.state.updatingIn, remaining);
    const expected = new OTPAuth.TOTP({ secret: exampleSecret }).generate({ timestamp });
    assert.equal(app.state.token, expected);
  }
});

test('clipboard copies only the token; interval and clipboard are cleaned up', () => {
  const app = setup({ hash: `#${exampleSecret}` });
  app.mount();
  const clipboard = app.state.clipboardButton;
  assert.equal(clipboard.config.text(), app.state.token);
  let selectionCleared = false;
  clipboard.handlers.success({ clearSelection() { selectionCleared = true; } });
  assert.equal(selectionCleared, true);
  assert.ok(app.state.copyMessage.includes('已复制'));
  clipboard.handlers.error();
  assert.ok(app.state.copyMessage.includes('失败'));
  app.tick();
  app.unmount();
  assert.equal(app.cleared, 42);
  assert.equal(clipboard.destroyed, true);
});
