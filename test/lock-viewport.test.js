// viewport-lock 的行為測試。使用 Node 內建 node:test，不引入額外依賴。
// 套件只碰 document 的一小部分，所以這裡放一個剛好夠用的 DOM 替身。
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import lockViewport, { lockViewport as lockViewportNamed } from '../src/index.js';

const LOCKED_DEFAULT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
const GESTURE_TYPES = ['gesturestart', 'gesturechange', 'gestureend'];

function createMockDocument() {
  const listeners = new Map();

  function makeElement(tagName) {
    const attrs = new Map();
    return {
      tagName,
      id: '',
      textContent: '',
      children: [],
      parentNode: null,
      setAttribute(name, value) {
        attrs.set(name, String(value));
        if (name === 'id') this.id = String(value);
      },
      getAttribute(name) {
        return attrs.has(name) ? attrs.get(name) : null;
      },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      remove() {
        const parent = this.parentNode;
        if (!parent) return;
        const index = parent.children.indexOf(this);
        if (index >= 0) parent.children.splice(index, 1);
        this.parentNode = null;
      },
    };
  }

  const head = makeElement('head');

  function walk(node, visit) {
    if (visit(node)) return node;
    for (const child of node.children) {
      const found = walk(child, visit);
      if (found) return found;
    }
    return null;
  }

  const document = {
    head,
    createElement: (tag) => makeElement(String(tag).toLowerCase()),
    querySelector(selector) {
      if (selector !== 'meta[name="viewport"]') return null;
      return (
        walk(
          head,
          (node) =>
            node.tagName === 'meta' && node.getAttribute('name') === 'viewport',
        ) || null
      );
    },
    getElementById(id) {
      return walk(head, (node) => node.id === id);
    },
    addEventListener(type, fn, options) {
      const list = listeners.get(type) ?? [];
      list.push({ fn, options });
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      const index = list.findIndex((entry) => entry.fn === fn);
      if (index >= 0) list.splice(index, 1);
    },
  };

  return { document, listeners };
}

function installDocument({ meta, style } = {}) {
  const mock = createMockDocument();
  globalThis.document = mock.document;
  if (meta != null) {
    const el = mock.document.createElement('meta');
    el.setAttribute('name', 'viewport');
    el.setAttribute('content', meta);
    mock.document.head.appendChild(el);
  }
  if (style) {
    const el = mock.document.createElement('style');
    el.id = style.id ?? 'viewport-lock-style';
    el.textContent = style.text ?? '';
    mock.document.head.appendChild(el);
  }
  return mock;
}

afterEach(() => {
  delete globalThis.document;
});

describe('lockViewport', { concurrency: false }, () => {
  test('default export is the named lockViewport function', () => {
    assert.equal(lockViewport, lockViewportNamed);
  });

  test('returns a no-op cleanup when document is missing', () => {
    delete globalThis.document;
    const cleanup = lockViewport();
    assert.equal(typeof cleanup, 'function');
    assert.doesNotThrow(() => cleanup());
    assert.equal(typeof document, 'undefined');
  });

  test('creates a viewport meta and removes it on cleanup', () => {
    const { document } = installDocument();
    const cleanup = lockViewport({ doubleTap: false, pinch: false });
    const meta = document.querySelector('meta[name="viewport"]');

    assert.ok(meta);
    assert.equal(meta.parentNode, document.head);
    assert.equal(meta.getAttribute('content'), LOCKED_DEFAULT);

    cleanup();
    assert.equal(document.querySelector('meta[name="viewport"]'), null);
    assert.equal(document.head.children.length, 0);
  });

  test('merges lock keys into an existing viewport meta and restores the original string', () => {
    const cases = [
      [
        'width=device-width, initial-scale=1, viewport-fit=cover',
        'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no',
      ],
      [
        'maximum-scale=5, user-scalable=yes',
        'maximum-scale=1, user-scalable=no, width=device-width, initial-scale=1',
      ],
      [
        'width = 375 , , initial-scale = 1.0 , shrink-to-fit',
        'width=375, initial-scale=1.0, shrink-to-fit, maximum-scale=1, user-scalable=no',
      ],
      [LOCKED_DEFAULT, LOCKED_DEFAULT],
    ];

    for (const [prev, expected] of cases) {
      const { document } = installDocument({ meta: prev });
      const cleanup = lockViewport({ doubleTap: false, pinch: false });
      const meta = document.querySelector('meta[name="viewport"]');
      assert.equal(meta.getAttribute('content'), expected, JSON.stringify(prev));
      cleanup();
      assert.equal(meta.getAttribute('content'), prev, JSON.stringify(prev));
    }
  });

  test('treats a missing content attribute as empty and restores an empty string', () => {
    const { document } = installDocument();
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.appendChild(meta);
    assert.equal(meta.getAttribute('content'), null);

    const cleanup = lockViewport({ doubleTap: false, pinch: false });
    assert.equal(meta.getAttribute('content'), LOCKED_DEFAULT);
    cleanup();
    assert.equal(meta.getAttribute('content'), '');
    assert.equal(meta.parentNode, document.head);
  });

  test('injects touch-action:manipulation so double-tap zoom is blocked without disabling scroll', () => {
    const { document } = installDocument();
    const cleanup = lockViewport({ meta: false, pinch: false });
    const style = document.getElementById('viewport-lock-style');

    assert.ok(style);
    assert.equal(style.textContent, 'html{touch-action:manipulation}');
    cleanup();
    assert.equal(document.getElementById('viewport-lock-style'), null);
  });

  test('does not overwrite or remove a pre-existing viewport-lock style', () => {
    const { document } = installDocument({
      style: { text: 'html{touch-action:pan-y}' },
    });
    const existing = document.getElementById('viewport-lock-style');
    const cleanup = lockViewport({ meta: false, pinch: false });

    assert.equal(document.head.children.length, 1);
    assert.equal(existing.textContent, 'html{touch-action:pan-y}');
    cleanup();
    assert.equal(document.getElementById('viewport-lock-style'), existing);
    assert.equal(existing.textContent, 'html{touch-action:pan-y}');
  });

  test('preventDefault on iOS gesture events and unsubscribes on cleanup', () => {
    const { listeners } = installDocument();
    const cleanup = lockViewport({ meta: false, doubleTap: false });

    for (const type of GESTURE_TYPES) {
      const list = listeners.get(type);
      assert.equal(list?.length, 1, type);
      assert.deepEqual(list[0].options, { passive: false });
      let prevented = false;
      list[0].fn({
        preventDefault() {
          prevented = true;
        },
      });
      assert.equal(prevented, true, type);
    }

    for (const type of ['touchmove', 'touchstart', 'wheel', 'scroll']) {
      assert.equal(listeners.has(type), false, type);
    }

    cleanup();
    for (const type of GESTURE_TYPES) {
      assert.equal(listeners.get(type).length, 0, type);
    }
  });

  test('each option can be turned off without affecting the others', () => {
    const { document, listeners } = installDocument({
      meta: 'width=device-width',
    });

    const cleanup = lockViewport({ meta: false, doubleTap: true, pinch: false });
    assert.equal(
      document.querySelector('meta[name="viewport"]').getAttribute('content'),
      'width=device-width',
    );
    assert.equal(
      document.getElementById('viewport-lock-style').textContent,
      'html{touch-action:manipulation}',
    );
    assert.equal(listeners.size, 0);
    cleanup();

    const again = lockViewport({ meta: true, doubleTap: false, pinch: true });
    assert.equal(
      document.querySelector('meta[name="viewport"]').getAttribute('content'),
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
    );
    assert.equal(document.getElementById('viewport-lock-style'), null);
    for (const type of GESTURE_TYPES) assert.equal(listeners.get(type).length, 1);
    again();
    assert.equal(
      document.querySelector('meta[name="viewport"]').getAttribute('content'),
      'width=device-width',
    );
    for (const type of GESTURE_TYPES) assert.equal(listeners.get(type).length, 0);
  });

  test('defaults enable meta, double-tap style, and gesture blocking together', () => {
    const { document, listeners } = installDocument();
    const cleanup = lockViewport();

    assert.equal(
      document.querySelector('meta[name="viewport"]').getAttribute('content'),
      LOCKED_DEFAULT,
    );
    assert.equal(
      document.getElementById('viewport-lock-style').textContent,
      'html{touch-action:manipulation}',
    );
    for (const type of GESTURE_TYPES) {
      assert.equal(listeners.get(type).length, 1);
    }

    cleanup();
    assert.equal(document.querySelector('meta[name="viewport"]'), null);
    assert.equal(document.getElementById('viewport-lock-style'), null);
    for (const type of GESTURE_TYPES) assert.equal(listeners.get(type).length, 0);
  });

  test('stacked cleanups restore viewport content and the style tag in reverse order', () => {
    const { document } = installDocument({ meta: 'width=800' });
    const first = lockViewport({ pinch: false });
    const meta = document.querySelector('meta[name="viewport"]');
    const locked = 'width=800, initial-scale=1, maximum-scale=1, user-scalable=no';
    assert.equal(meta.getAttribute('content'), locked);
    assert.ok(document.getElementById('viewport-lock-style'));

    const second = lockViewport({ pinch: false });
    assert.equal(meta.getAttribute('content'), locked);
    assert.equal(document.head.children.filter((el) => el.tagName === 'style').length, 1);

    second();
    assert.equal(meta.getAttribute('content'), locked);
    assert.ok(document.getElementById('viewport-lock-style'));

    first();
    assert.equal(meta.getAttribute('content'), 'width=800');
    assert.equal(document.getElementById('viewport-lock-style'), null);
  });
});
