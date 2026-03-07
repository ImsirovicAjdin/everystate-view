/**
 * @everystate/view: app.js
 *
 * One-call app bootstrapper. Wraps flatten + mount + intent auto-wiring
 * into a single createApp() call.
 *
 * Usage:
 *   import { createApp } from '@everystate/view/app';
 *   import { createEveryState } from '@everystate/core';
 *
 *   const store = createEveryState({ count: 0, ui: { theme: 'dark' } });
 *
 *   const cleanup = createApp(store, '#app', {
 *     tag: 'div', children: [
 *       { tag: 'span', text: '{count}' },
 *       { tag: 'button', text: '+1', onClick: 'increment' }
 *     ]
 *   }, {
 *     increment() { store.set('count', store.get('count') + 1); }
 *   });
 *
 * Copyright (c) 2026 Ajdin Imsirovic. MIT License.
 */

import { flatten } from './resolve.js';
import { mount } from './project.js';

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
 *
 * Bootstraps an EveryState view app in one call:
 *   1. Flattens the view spec into the store under 'view.*'
 *   2. Auto-scans for intent.* targets and generates store.set handlers
 *   3. Merges auto-handlers with user-provided handlers
 *   4. Mounts the DOM projector
 *
 * @param {object} store - EveryState store instance
 * @param {string|Element} el - CSS selector or DOM element to mount into
 * @param {object} viewSpec - nested view tree specification
 * @param {object} [handlers={}] - named handler functions
 * @returns {function} cleanup - call to unmount and unsubscribe
 */
export function createApp(store, el, viewSpec, handlers = {}) {
  // Resolve container
  const container = typeof el === 'string'
    ? document.querySelector(el)
    : el;

  if (!container) {
    throw new Error(`[createApp] Container not found: ${el}`);
  }

  // 1. Flatten view spec into store
  flatten(viewSpec, store, 'view');

  // 2. Auto-scan for intent.* targets
  const autoHandlers = scanIntentTargets(viewSpec, store);

  // 3. Merge: user handlers take precedence over auto-handlers
  const mergedHandlers = { ...autoHandlers, ...handlers };

  // 4. Mount DOM projector
  const cleanup = mount(store, 'view', container, mergedHandlers);

  return cleanup;
}
