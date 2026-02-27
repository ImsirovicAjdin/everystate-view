/**
 * @everystate/view: integration tests via @everystate/event-test
 *
 * Tests the view module through EveryState using createEventTest.
 * Verifies: flatten writes normalized nodes into the store,
 * store-driven resolve produces correct concrete trees,
 * and the full workflow of State-Driven Development (data + view coexist in one store).
 */

import { createEventTest, runTests } from '@everystate/event-test';
import { createEveryState } from '@everystate/core';
import {
  normalize,
  flatten,
  resolveNode,
  resolveTree,
  serialize,
  getByPath,
  resetIdCounter
} from '@everystate/view/resolve';
import { extractDataPaths } from '@everystate/view/project';

// Helper: read all normalized nodes from a store
function readNodes(store, prefix = 'view') {
  const nodes = {};
  const allNodes = store.get(`${prefix}.nodes`);
  if (allNodes) {
    for (const key of Object.keys(allNodes)) {
      nodes[key] = store.get(`${prefix}.nodes.${key}`);
    }
  }
  return nodes;
}

const results = runTests({

  // == flatten writes normalized nodes into EveryState ==================

  'flatten writes rootId to store': () => {
    resetIdCounter();
    const t = createEventTest({});
    flatten({ tag: 'div', class: 'app' }, t.store, 'view');
    t.assertPath('view.rootId', 'v0');
  },

  'flatten writes node data to store': () => {
    resetIdCounter();
    const t = createEventTest({});
    flatten({ tag: 'div', class: 'app' }, t.store, 'view');
    const node = t.store.get('view.nodes.v0');
    if (node.tag !== 'div') throw new Error('root tag should be div');
    if (node.class !== 'app') throw new Error('root class should be app');
  },

  'flatten writes children as separate nodes': () => {
    resetIdCounter();
    const t = createEventTest({});
    flatten({
      tag: 'div',
      children: [
        { tag: 'h1', text: 'Title' },
        { tag: 'p', text: 'Body' }
      ]
    }, t.store, 'view');

    const root = t.store.get('view.nodes.v0');
    if (root.childIds.length !== 2) throw new Error('root should have 2 childIds');
    const h1 = t.store.get('view.nodes.v1');
    if (h1.tag !== 'h1' || h1.text !== 'Title') throw new Error('h1 mismatch');
    const p = t.store.get('view.nodes.v2');
    if (p.tag !== 'p' || p.text !== 'Body') throw new Error('p mismatch');
  },

  'flatten preserves forEach and template': () => {
    resetIdCounter();
    const t = createEventTest({});
    flatten({
      tag: 'ul',
      forEach: 'items',
      as: 'item',
      template: { tag: 'li', text: 'item.name' }
    }, t.store, 'view');

    const node = t.store.get('view.nodes.v0');
    if (node.forEach !== 'items') throw new Error('forEach not preserved');
    if (node.as !== 'item') throw new Error('as not preserved');
    if (node.template.tag !== 'li') throw new Error('template not preserved');
  },

  // == Store-driven resolve ============================================

  'resolve tree from store state': () => {
    resetIdCounter();
    const t = createEventTest({ title: 'Hello World' });
    flatten({
      tag: 'div',
      children: [{ tag: 'h1', text: '{title}' }]
    }, t.store, 'view');

    const nodes = readNodes(t.store);
    const rootId = t.store.get('view.rootId');
    const resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children[0].text !== 'Hello World') {
      throw new Error(`Expected "Hello World", got "${resolved.children[0].text}"`);
    }
  },

  'resolve forEach from store arrays': () => {
    resetIdCounter();
    const t = createEventTest({
      tasks: [
        { id: 1, text: 'Task A', done: false },
        { id: 2, text: 'Task B', done: true }
      ]
    });
    flatten({
      tag: 'ul',
      forEach: 'tasks',
      as: 'task',
      template: {
        tag: 'li',
        children: [{ tag: 'span', text: 'task.text' }]
      }
    }, t.store, 'view');

    const nodes = readNodes(t.store);
    const rootId = t.store.get('view.rootId');
    const resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children.length !== 2) throw new Error('forEach should expand 2');
    if (resolved.children[0].children[0].text !== 'Task A') throw new Error('item 0');
    if (resolved.children[1].children[0].text !== 'Task B') throw new Error('item 1');
  },

  // == Surgical updates ================================================

  'surgical text update via store.set': () => {
    resetIdCounter();
    const t = createEventTest({ heading: 'Old' });
    flatten({
      tag: 'div',
      children: [{ tag: 'h1', text: '{heading}' }]
    }, t.store, 'view');

    const nodes = readNodes(t.store);
    const rootId = t.store.get('view.rootId');

    let resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children[0].text !== 'Old') throw new Error('initial');

    t.store.set('heading', 'New');
    resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children[0].text !== 'New') throw new Error('after set');
  },

  'surgical array update changes forEach output': () => {
    resetIdCounter();
    const t = createEventTest({
      items: [{ name: 'A' }, { name: 'B' }]
    });
    flatten({
      tag: 'ul',
      forEach: 'items',
      as: 'item',
      template: { tag: 'li', text: 'item.name' }
    }, t.store, 'view');

    const nodes = readNodes(t.store);
    const rootId = t.store.get('view.rootId');

    let resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children.length !== 2) throw new Error('initial 2');

    t.store.set('items', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children.length !== 3) throw new Error('after push 3');
    if (resolved.children[2].text !== 'C') throw new Error('new item');
  },

  // == Node independence ==============================================─

  'individual node subscription fires on change': () => {
    resetIdCounter();
    const store = createEveryState({});
    flatten({
      tag: 'div',
      children: [
        { tag: 'h1', text: 'Title' },
        { tag: 'p', text: 'Body' }
      ]
    }, store, 'view');

    let h1Changes = 0;
    let pChanges = 0;
    store.subscribe('view.nodes.v1', () => h1Changes++);
    store.subscribe('view.nodes.v2', () => pChanges++);

    const h1 = store.get('view.nodes.v1');
    store.set('view.nodes.v1', { ...h1, text: 'New Title' });

    if (h1Changes !== 1) throw new Error(`h1 fired ${h1Changes} times`);
    if (pChanges !== 0) throw new Error(`p fired ${pChanges} times`);
  },

  'wildcard subscription on view.nodes.* catches all': () => {
    resetIdCounter();
    const store = createEveryState({});
    flatten({
      tag: 'div',
      children: [{ tag: 'span', text: 'a' }, { tag: 'span', text: 'b' }]
    }, store, 'view');

    const changes = [];
    store.subscribe('view.nodes.*', (detail) => changes.push(detail.path));

    store.set('view.nodes.v1', { ...store.get('view.nodes.v1'), text: 'A' });
    store.set('view.nodes.v2', { ...store.get('view.nodes.v2'), text: 'B' });

    if (changes.length !== 2) throw new Error(`expected 2, got ${changes.length}`);
  },

  // == Serialize (SSR) ================================================─

  'serialize produces valid HTML from store': () => {
    resetIdCounter();
    const t = createEventTest({
      name: 'World',
      items: [{ label: 'one' }, { label: 'two' }]
    });
    flatten({
      tag: 'div',
      class: 'app',
      children: [
        { tag: 'h1', text: 'Hello {name}' },
        {
          tag: 'ul',
          forEach: 'items',
          as: 'item',
          template: { tag: 'li', text: 'item.label' }
        }
      ]
    }, t.store, 'view');

    const nodes = readNodes(t.store);
    const rootId = t.store.get('view.rootId');
    const resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    const html = serialize(resolved);

    if (!html.includes('Hello World')) throw new Error('missing interpolated text');
    if (!html.includes('class="app"')) throw new Error('missing class');
    if (!html.includes('<li>one</li>')) throw new Error('missing item 1');
    if (!html.includes('<li>two</li>')) throw new Error('missing item 2');
  },

  // == Full SDD workflow ==============================================─

  'full SDD: data and view coexist in one store': () => {
    resetIdCounter();
    const t = createEventTest({
      todos: [
        { id: 1, text: 'Learn SDD', done: true },
        { id: 2, text: 'Build @everystate/view', done: false }
      ],
      inputText: ''
    });

    flatten({
      tag: 'div',
      class: 'todo-app',
      children: [
        { tag: 'h2', text: 'Todo ({todos.length})' },
        {
          tag: 'ul',
          forEach: 'todos',
          as: 'todo',
          template: {
            tag: 'li',
            classIf: { done: 'todo.done' },
            children: [{ tag: 'span', text: 'todo.text' }]
          }
        },
        {
          tag: 'div',
          class: 'stats',
          children: [
            { tag: 'span', text: 'Done: {todos.filter(t => t.done).length}' }
          ]
        }
      ]
    }, t.store, 'view');

    // Both data and view in same store
    t.assertPath('view.rootId', 'v0');

    const nodes = readNodes(t.store);
    const rootId = t.store.get('view.rootId');
    const resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));

    if (resolved.children[0].text !== 'Todo (2)') throw new Error('heading');
    if (resolved.children[1].children.length !== 2) throw new Error('forEach');
    if (resolved.children[1].children[0].children[0].text !== 'Learn SDD') throw new Error('todo 1');
    if (resolved.children[2].children[0].text !== 'Done: 1') throw new Error('stats');

    // Mutate data, re-resolve
    t.store.set('todos', [
      { id: 1, text: 'Learn SDD', done: true },
      { id: 2, text: 'Build @everystate/view', done: true },
      { id: 3, text: 'Ship it', done: false }
    ]);
    const resolved2 = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved2.children[0].text !== 'Todo (3)') throw new Error('heading updated');
    if (resolved2.children[1].children.length !== 3) throw new Error('forEach 3');
    if (resolved2.children[2].children[0].text !== 'Done: 2') throw new Error('stats updated');
  },

  // == Deterministic IDs ==============================================─

  'normalize produces deterministic IDs after reset': () => {
    resetIdCounter();
    const { rootId: r1 } = normalize({ tag: 'div', children: [{ tag: 'span' }] });
    resetIdCounter();
    const { rootId: r2 } = normalize({ tag: 'div', children: [{ tag: 'span' }] });
    if (r1 !== r2) throw new Error('IDs not deterministic');
  },

  // == Batch write ====================================================─

  'flatten uses setMany for atomic write': () => {
    resetIdCounter();
    const store = createEveryState({});

    const changes = [];
    store.subscribe('view.*', (detail) => changes.push(detail.path));

    flatten({
      tag: 'div',
      children: [{ tag: 'p', text: 'a' }, { tag: 'p', text: 'b' }]
    }, store, 'view');

    if (changes.length < 1) throw new Error('wildcard should fire');
    if (store.get('view.rootId') !== 'v0') throw new Error('rootId');
    if (!store.get('view.nodes.v0')) throw new Error('root node');
    if (!store.get('view.nodes.v1')) throw new Error('child 1');
    if (!store.get('view.nodes.v2')) throw new Error('child 2');
  },

  // == extractDataPaths ================================================─

  'extractDataPaths: simple path': () => {
    const paths = extractDataPaths('{title}');
    if (paths.length !== 1 || paths[0] !== 'title') throw new Error(`got ${JSON.stringify(paths)}`);
  },

  'extractDataPaths: .length extracts root': () => {
    const paths = extractDataPaths('{todos.length}');
    if (paths.length !== 1 || paths[0] !== 'todos') throw new Error(`got ${JSON.stringify(paths)}`);
  },

  'extractDataPaths: .filter().length extracts root': () => {
    const paths = extractDataPaths('{todos.filter(t => t.done).length}');
    if (paths.length !== 1 || paths[0] !== 'todos') throw new Error(`got ${JSON.stringify(paths)}`);
  },

  'extractDataPaths: deduplicates same root': () => {
    const paths = extractDataPaths('Total: {todos.length}, Done: {todos.filter(t => t.done).length}');
    if (paths.length !== 1 || paths[0] !== 'todos') throw new Error(`got ${JSON.stringify(paths)}`);
  },

  'extractDataPaths: non-string returns empty': () => {
    if (extractDataPaths(42).length !== 0) throw new Error('number');
    if (extractDataPaths(null).length !== 0) throw new Error('null');
    if (extractDataPaths(undefined).length !== 0) throw new Error('undef');
  },

  'extractDataPaths: no braces returns empty': () => {
    if (extractDataPaths('plain text').length !== 0) throw new Error('plain');
  },

  'extractDataPaths: multiple roots': () => {
    const paths = extractDataPaths('{count} of {items.length}');
    if (paths.length !== 2) throw new Error(`expected 2, got ${paths.length}`);
    if (!paths.includes('count')) throw new Error('missing count');
    if (!paths.includes('items')) throw new Error('missing items');
  },

  // == Data-path subscription (store-level) ============================─

  'data-path subscriptions: store.set on data fires re-resolve': () => {
    resetIdCounter();
    const t = createEventTest({
      todos: [
        { id: 1, text: 'A', done: true },
        { id: 2, text: 'B', done: false }
      ]
    });

    flatten({
      tag: 'div',
      children: [
        { tag: 'span', text: 'Done: {todos.filter(t => t.done).length}' }
      ]
    }, t.store, 'view');

    // Verify initial resolve
    const nodes = readNodes(t.store);
    const rootId = t.store.get('view.rootId');
    let resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children[0].text !== 'Done: 1') throw new Error('initial');

    // Mutate the data
    t.store.set('todos', [
      { id: 1, text: 'A', done: true },
      { id: 2, text: 'B', done: true }
    ]);

    // Re-resolve should reflect the mutation
    resolved = resolveTree(nodes, rootId, (p) => t.store.get(p));
    if (resolved.children[0].text !== 'Done: 2') throw new Error(`after set: ${resolved.children[0].text}`);
  }
});

if (results.failed > 0) process.exit(1);
