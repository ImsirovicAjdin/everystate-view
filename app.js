/**
 * @everystate/view: app.js
 *
 * One-call app bootstrapper. Wraps flatten + mount + intent auto-wiring
 * + css extraction into a single createApp() call.
 *
 * Signature A (existing - pass your own store):
 *   import { createApp } from '@everystate/view/app';
 *   import { createEveryState } from '@everystate/core';
 *
 *   const store = createEveryState({ count: 0 });
 *   const { store: s, cleanup } = createApp(store, '#app', viewSpec, handlers);
 *
 * Signature B (new - let createApp create the store):
 *   const { store, cleanup } = createApp('#app', { count: 0 }, viewSpec, handlers);
 *
 * Copyright (c) 2026 Ajdin Imsirovic. MIT License.
 */

import { flatten } from './resolve.js';
import { mount } from './project.js';

let _createEveryState = null;
async function ensureCoreImport() {
  if (!_createEveryState) {
    const mod = await import('@everystate/core');
    _createEveryState = mod.createEveryState;
  }
  return _createEveryState;
}

// Walk the view spec tree and write css.{class}.{prop} to the store
// for any node that has both `class` and `css`.
export function extractCss(spec, store) {
  if (!spec || typeof spec !== 'object') return;
  if (spec.css && spec.class) {
    for (const [prop, val] of Object.entries(spec.css)) {
      store.set(`css.${spec.class}.${prop}`, val);
    }
  }
  if (Array.isArray(spec.children)) {
    spec.children.forEach(child => extractCss(child, store));
  }
  if (Array.isArray(spec)) {
    spec.forEach(child => extractCss(child, store));
  }
}

// Scan a view spec tree for intent.* targets in event keys.
// Returns auto-generated handlers that write to intent paths.

const EVENT_KEYS = ['onClick', 'onDblClick', 'onEnter', 'onBlur'];

function scanIntentTargets(spec, store) {
  const handlers = {};
  const seen = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    for (const key of EVENT_KEYS) {
      const target = node[key];
      if (typeof target === 'string' && target.startsWith('intent.')) {
        const name = target.replace(/\(.*\)$/, '');
        if (!seen.has(name)) {
          seen.add(name);
          handlers[name] = (arg) => {
            store.set(name, arg instanceof Event ? Date.now() : (arg ?? Date.now()));
          };
        }
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
    if (node.template) walk(node.template);
    if (Array.isArray(node.template?.children)) {
      node.template.children.forEach(walk);
    }
  }

  walk(spec);
  return handlers;
}

/**
 * createApp(store, el, viewSpec, handlers?)
 * createApp(el, initialState, viewSpec, handlers?)
 *
 * Bootstraps an EveryState view app in one call:
 *   1. Creates or uses an EveryState store
 *   2. Auto-extracts co-located css from view nodes
 *   3. Flattens the view spec into the store under 'view.*'
 *   4. Auto-scans for intent.* targets and generates store.set handlers
 *   5. Merges auto-handlers with user-provided handlers
 *   6. Mounts the DOM projector
 *
 * @param {object|string|Element} storeOrEl - EveryState store, or CSS selector / DOM element
 * @param {string|Element|object} elOrState - CSS selector / DOM element, or initial state object
 * @param {object} viewSpec - nested view tree specification
 * @param {object} [handlers={}] - named handler functions
 * @returns {{ store, cleanup }} - the store instance and a cleanup function
 */
export function createApp(storeOrEl, elOrState, viewSpec, handlers = {}) {
  let store, el;

  // Detect signature: does first arg look like a store? (has .get method)
  if (storeOrEl && typeof storeOrEl === 'object' && typeof storeOrEl.get === 'function') {
    // Signature A: createApp(store, el, viewSpec, handlers)
    store = storeOrEl;
    el = elOrState;
  } else {
    // Signature B: createApp(el, initialState, viewSpec, handlers)
    el = storeOrEl;
    if (!_createEveryState) {
      throw new Error(
        '[createApp] To pass initial state directly, ' +
        'first: import { createEveryState } from "@everystate/core"; ' +
        'or call createApp.init() before use.'
      );
    }
    store = _createEveryState(elOrState || {});
  }

  // Resolve container
  const container = typeof el === 'string'
    ? document.querySelector(el)
    : el;

  if (!container) {
    throw new Error(`[createApp] Container not found: ${el}`);
  }

  // 1. Auto-extract co-located css from view nodes
  extractCss(viewSpec, store);

  // 2. Flatten view spec into store
  flatten(viewSpec, store, 'view');

  // 3. Auto-scan for intent.* targets
  const autoHandlers = scanIntentTargets(viewSpec, store);

  // 4. Merge: user handlers take precedence over auto-handlers
  const mergedHandlers = { ...autoHandlers, ...handlers };

  // 5. Auto-inject store as first arg to all handlers
  const boundHandlers = {};
  for (const [key, fn] of Object.entries(mergedHandlers)) {
    if (typeof fn === 'function') {
      boundHandlers[key] = (...args) => fn(store, ...args);
    }
  }

  // 6. Mount DOM projector
  const cleanup = mount(store, 'view', container, boundHandlers);

  return { store, cleanup };
}

// Allow eager core import for Signature B
createApp.init = async function () {
  await ensureCoreImport();
  return createApp;
};

// Synchronous core injection for environments that prefer it
createApp.use = function (createEveryStateFn) {
  _createEveryState = createEveryStateFn;
  return createApp;
};
