/**
 * @everystate/view: self-test.js
 *
 * Zero-dependency self-test. Runs on postinstall.
 * Tests the pure, DOMless resolve.js module:
 *   normalize, resolveNode, resolveTree, serialize,
 *   getByPath, interpolate, flatten.
 *
 * No @everystate/event-test. No DOM. Just Node.
 */

import {
  normalize,
  resolveNode,
  resolveTree,
  serialize,
  getByPath,
  interpolate,
  resetIdCounter,
  flatten
} from './resolve.js';

import { extractDataPaths } from './project.js';
import { extractCss } from './app.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function eq(a, b) {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function section(name) {
  console.log(`\n== ${name} ==`);
}

// == getByPath =========================================================

section('getByPath');

const obj = { a: { b: { c: 42 } }, items: [10, 20, 30] };
assert(getByPath(obj, 'a.b.c') === 42, 'nested path');
assert(getByPath(obj, 'a.b') !== undefined, 'object path');
assert(getByPath(obj, 'a.x') === undefined, 'missing path');
assert(getByPath(obj, 'items.1') === 20, 'array index via dot-path');
assert(getByPath(null, 'a') === undefined, 'null object');
assert(getByPath(obj, '') === undefined, 'empty path');

// == interpolate =======================================================

section('interpolate');

const data = { count: 3, name: 'Alice', items: [1, 2, 3] };
const getData = (path) => getByPath(data, path);

assert(interpolate('Hello {name}', getData) === 'Hello Alice', 'simple interpolation');
assert(interpolate('Count: {count}', getData) === 'Count: 3', 'number interpolation');
assert(interpolate('{items.length}', getData) === '3', '.length interpolation');
assert(interpolate('no braces', getData) === 'no braces', 'no interpolation needed');
assert(interpolate('{missing}', getData) === '{missing}', 'missing path preserved');

// == normalize =========================================================

section('normalize');

resetIdCounter();
const tree1 = {
  tag: 'div',
  class: 'app',
  children: [
    { tag: 'h1', text: 'Hello' },
    { tag: 'p', text: 'World' }
  ]
};

const { nodes: n1, rootId: r1 } = normalize(tree1);
assert(r1 === 'v0', 'root id is v0');
assert(n1['v0'].tag === 'div', 'root tag');
assert(n1['v0'].class === 'app', 'root class');
assert(eq(n1['v0'].childIds, ['v1', 'v2']), 'root childIds');
assert(n1['v0'].parentId === null, 'root parentId is null');
assert(n1['v1'].tag === 'h1', 'child 1 tag');
assert(n1['v1'].text === 'Hello', 'child 1 text');
assert(n1['v1'].parentId === 'v0', 'child 1 parentId');
assert(n1['v2'].tag === 'p', 'child 2 tag');
assert(n1['v2'].text === 'World', 'child 2 text');
assert(n1['v2'].parentId === 'v0', 'child 2 parentId');
assert(n1['v2'].childIds.length === 0, 'leaf has empty childIds');
assert(Object.keys(n1).length === 3, '3 nodes total');

// == normalize with forEach ============================================

section('normalize with forEach');

resetIdCounter();
const tree2 = {
  tag: 'ul',
  forEach: 'todos',
  as: 'todo',
  template: {
    tag: 'li',
    children: [
      { tag: 'span', text: 'todo.text' }
    ]
  }
};

const { nodes: n2, rootId: r2 } = normalize(tree2);
assert(n2[r2].forEach === 'todos', 'forEach preserved');
assert(n2[r2].as === 'todo', 'as preserved');
assert(n2[r2].template !== undefined, 'template preserved');
assert(n2[r2].template.tag === 'li', 'template tag');
assert(n2[r2].childIds.length === 0, 'forEach node has empty childIds (populated at resolve)');

// == normalize deep nesting ============================================

section('normalize deep nesting');

resetIdCounter();
const tree3 = {
  tag: 'div',
  children: [
    {
      tag: 'section',
      children: [
        { tag: 'article', children: [{ tag: 'span', text: 'deep' }] }
      ]
    }
  ]
};

const { nodes: n3 } = normalize(tree3);
assert(Object.keys(n3).length === 4, '4 nodes for 3-level nesting');
// Find the span
const spanNode = Object.values(n3).find(n => n.tag === 'span');
assert(spanNode.text === 'deep', 'deep nested text');
assert(spanNode.childIds.length === 0, 'span is leaf');
// Verify parent chain
const articleNode = n3[spanNode.parentId];
assert(articleNode.tag === 'article', 'span parent is article');
const sectionNode = n3[articleNode.parentId];
assert(sectionNode.tag === 'section', 'article parent is section');

// == resolveNode =======================================================

section('resolveNode');

const todoData = {
  todos: [
    { id: 1, text: 'Buy milk', done: true },
    { id: 2, text: 'Write code', done: false }
  ]
};
const todoGetData = (path) => getByPath(todoData, path);

const textNode = { id: 'x', tag: 'span', text: 'Total: {todos.length}', childIds: [] };
const resolved1 = resolveNode(textNode, todoGetData);
assert(resolved1.text === 'Total: 2', 'interpolated text in resolveNode');

const classIfNode = {
  id: 'y', tag: 'li', class: 'item',
  classIf: { done: 'todos.0.done' },
  childIds: []
};
const resolved2 = resolveNode(classIfNode, todoGetData);
assert(resolved2.class === 'item done', 'classIf applied when truthy');

const classIfFalse = {
  id: 'z', tag: 'li', class: 'item',
  classIf: { done: 'todos.1.done' },
  childIds: []
};
const resolved3 = resolveNode(classIfFalse, todoGetData);
assert(resolved3.class === 'item', 'classIf not applied when falsy');

const bindNode = { id: 'w', tag: 'input', bind: 'todos.0.text', childIds: [] };
const resolved4 = resolveNode(bindNode, todoGetData);
assert(resolved4.boundValue === 'Buy milk', 'bind resolves value');

// == resolveTree =======================================================

section('resolveTree');

resetIdCounter();
const appTree = {
  tag: 'div',
  class: 'app',
  children: [
    { tag: 'h1', text: 'Todo ({todos.length})' },
    { tag: 'p', text: '{todos.filter(t => t.done).length} done' }
  ]
};
const { nodes: appNodes, rootId: appRoot } = normalize(appTree);
const resolvedApp = resolveTree(appNodes, appRoot, todoGetData);

assert(resolvedApp.tag === 'div', 'resolved root tag');
assert(resolvedApp.children.length === 2, 'resolved 2 children');
assert(resolvedApp.children[0].text === 'Todo (2)', 'resolved h1 text with length');
assert(resolvedApp.children[1].text === '1 done', 'resolved filter().length');

// == resolveTree with forEach ==========================================

section('resolveTree with forEach');

resetIdCounter();
const listTree = {
  tag: 'ul',
  forEach: 'todos',
  as: 'todo',
  template: {
    tag: 'li',
    children: [
      { tag: 'span', text: 'todo.text' }
    ]
  }
};
const { nodes: listNodes, rootId: listRoot } = normalize(listTree);
const resolvedList = resolveTree(listNodes, listRoot, todoGetData);

assert(resolvedList.tag === 'ul', 'forEach root tag');
assert(resolvedList.children.length === 2, 'forEach expanded 2 items');
assert(resolvedList.children[0].tag === 'li', 'forEach item 0 tag');
assert(resolvedList.children[0].children[0].text === 'Buy milk', 'forEach item 0 text resolved');
assert(resolvedList.children[1].children[0].text === 'Write code', 'forEach item 1 text resolved');

// == serialize =========================================================

section('serialize');

resetIdCounter();
const simpleTree = { tag: 'div', class: 'box', children: [{ tag: 'span', text: 'hi' }] };
const { nodes: sNodes, rootId: sRoot } = normalize(simpleTree);
const resolvedSimple = resolveTree(sNodes, sRoot, () => undefined);
const html = serialize(resolvedSimple);

assert(html.includes('<div class="box">'), 'serialized div with class');
assert(html.includes('<span>hi</span>'), 'serialized span with text');

// Self-closing tag
resetIdCounter();
const inputTree = { tag: 'input', type: 'text', placeholder: 'enter...' };
const { nodes: iNodes, rootId: iRoot } = normalize(inputTree);
const resolvedInput = resolveTree(iNodes, iRoot, () => undefined);
const inputHtml = serialize(resolvedInput);
assert(inputHtml.includes('<input'), 'serialized input tag');
assert(inputHtml.includes('type="text"'), 'serialized type attribute');
assert(inputHtml.includes('/>'), 'self-closing input');

// == flatten (mock store) ==============================================

section('flatten');

resetIdCounter();
const flatTree = {
  tag: 'div',
  children: [{ tag: 'p', text: 'hello' }]
};

// Mock store
const mockEntries = {};
const mockStore = {
  setMany(entries) {
    Object.assign(mockEntries, entries);
  }
};

const { nodes: fNodes, rootId: fRoot, entries } = flatten(flatTree, mockStore, 'view');
assert(fRoot === 'v0', 'flatten rootId');
assert(mockEntries['view.rootId'] === 'v0', 'flatten wrote rootId to store');
assert(mockEntries['view.nodes.v0'] !== undefined, 'flatten wrote root node');
assert(mockEntries['view.nodes.v0'].tag === 'div', 'flatten root node tag');
assert(mockEntries['view.nodes.v1'] !== undefined, 'flatten wrote child node');
assert(mockEntries['view.nodes.v1'].text === 'hello', 'flatten child text');
assert(Object.keys(entries).length === 3, 'flatten entries: rootId + 2 nodes');

// == SDD full example (the todo app view tree) =========================

section('SDD full example');

resetIdCounter();
const sddTree = {
  tag: 'div',
  class: 'todo-app',
  children: [
    { tag: 'h2', text: 'SDD Todo App' },
    {
      tag: 'div',
      class: 'input-row',
      children: [
        { tag: 'input', type: 'text', bind: 'inputText', onEnter: 'addTodo' },
        { tag: 'button', text: 'Add', onClick: 'addTodo' }
      ]
    },
    {
      tag: 'ul',
      class: 'todo-list',
      forEach: 'todos',
      as: 'todo',
      template: {
        tag: 'li',
        class: 'todo-item',
        classIf: { done: 'todo.done' },
        children: [
          { tag: 'span', class: 'todo-text', text: 'todo.text' },
          { tag: 'button', class: 'delete', text: 'x', onClick: 'deleteTodo(todo.id)' }
        ]
      }
    },
    {
      tag: 'div',
      class: 'stats',
      children: [
        { tag: 'span', text: 'Total: {todos.length}' },
        { tag: 'span', text: 'Done: {todos.filter(t => t.done).length}' }
      ]
    }
  ]
};

const { nodes: sddNodes, rootId: sddRoot } = normalize(sddTree);
const nodeCount = Object.keys(sddNodes).length;
assert(nodeCount >= 9, `SDD tree normalized to ${nodeCount} nodes (≥9)`);
assert(sddNodes[sddRoot].tag === 'div', 'SDD root is div');
assert(sddNodes[sddRoot].class === 'todo-app', 'SDD root class');

// Find the forEach node
const forEachNode = Object.values(sddNodes).find(n => n.forEach === 'todos');
assert(forEachNode !== undefined, 'SDD has forEach node');
assert(forEachNode.template.tag === 'li', 'SDD template is li');

// Resolve the full tree
const sddData = {
  todos: [
    { id: 1, text: 'Learn SDD', done: true },
    { id: 2, text: 'Build view', done: false }
  ],
  inputText: ''
};
const sddGetData = (path) => getByPath(sddData, path);
const resolvedSdd = resolveTree(sddNodes, sddRoot, sddGetData);

assert(resolvedSdd.children[0].text === 'SDD Todo App', 'SDD h2 text');
// The forEach (ul) is child index 2
const ulResolved = resolvedSdd.children[2];
assert(ulResolved.children.length === 2, 'SDD forEach expanded 2 todos');
assert(ulResolved.children[0].children[0].text === 'Learn SDD', 'SDD todo 1 text');
assert(ulResolved.children[1].children[0].text === 'Build view', 'SDD todo 2 text');

// Stats
const statsResolved = resolvedSdd.children[3];
assert(statsResolved.children[0].text === 'Total: 2', 'SDD stats total');
assert(statsResolved.children[1].text === 'Done: 1', 'SDD stats done');

// SSR: serialize the resolved tree
const sddHtml = serialize(resolvedSdd);
assert(sddHtml.includes('Learn SDD'), 'SSR contains todo text');
assert(sddHtml.includes('Total: 2'), 'SSR contains stats');
assert(sddHtml.includes('class="todo-app"'), 'SSR contains root class');

// == extractDataPaths ==================================================

section('extractDataPaths');

assert(eq(extractDataPaths('{title}'), ['title']), 'simple path');
assert(eq(extractDataPaths('{todos.length}'), ['todos']), '.length extracts root');
assert(eq(extractDataPaths('{todos.filter(t => t.done).length}'), ['todos']), '.filter().length extracts root');
assert(eq(extractDataPaths('{user.name}'), ['user.name']), 'nested path returns full path');
assert(eq(extractDataPaths('no braces'), []), 'no braces returns empty');
assert(eq(extractDataPaths(''), []), 'empty string returns empty');
assert(eq(extractDataPaths(42), []), 'non-string returns empty');
assert(eq(extractDataPaths(null), []), 'null returns empty');

// Multiple expressions in one string
const multi = extractDataPaths('Total: {todos.length}, Done: {todos.filter(t => t.done).length}');
assert(multi.length === 1, 'deduplicates same root path');
assert(multi[0] === 'todos', 'deduped root is todos');

// Two different roots
const twoRoots = extractDataPaths('{count} of {items.length}');
assert(twoRoots.length === 2, 'two different roots');
assert(twoRoots.includes('count'), 'has count');
assert(twoRoots.includes('items'), 'has items');

// == extractCss ========================================================

section('extractCss');

// Mock store with set() that records calls
function mockCssStore() {
  const entries = {};
  return {
    set(path, val) { entries[path] = val; },
    entries,
  };
}

{
  const ms = mockCssStore();
  extractCss({ tag: 'div', class: 'box', css: { color: 'red', fontSize: '14px' } }, ms);
  assert(ms.entries['css.box.color'] === 'red', 'extractCss writes css.{class}.{prop}');
  assert(ms.entries['css.box.fontSize'] === '14px', 'extractCss writes second prop');
}

{
  const ms = mockCssStore();
  extractCss({ tag: 'div', css: { color: 'red' } }, ms);
  assert(Object.keys(ms.entries).length === 0, 'extractCss skips nodes without class');
}

{
  const ms = mockCssStore();
  extractCss({ tag: 'div', class: 'outer', css: { margin: '0' }, children: [
    { tag: 'span', class: 'inner', css: { padding: '4px' } }
  ] }, ms);
  assert(ms.entries['css.outer.margin'] === '0', 'extractCss parent css');
  assert(ms.entries['css.inner.padding'] === '4px', 'extractCss child css');
}

{
  const ms = mockCssStore();
  extractCss(null, ms);
  extractCss(undefined, ms);
  extractCss(42, ms);
  assert(Object.keys(ms.entries).length === 0, 'extractCss ignores non-objects');
}

{
  const ms = mockCssStore();
  extractCss({ tag: 'div', class: 'plain' }, ms);
  assert(Object.keys(ms.entries).length === 0, 'extractCss skips nodes without css');
}

// == Summary ===========================================================

console.log(`\n@everystate/view v1.1.0 self-test`);
if (failed > 0) {
  console.error(`✗ ${failed} assertion(s) failed, ${passed} passed`);
  process.exit(1);
} else {
  console.log(`✓ ${passed} assertions passed`);
}
