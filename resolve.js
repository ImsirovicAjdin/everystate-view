/**
 * @everystate/view: resolve.js
 *
 * Pure, DOMless view tree operations.
 *
 * Two phases:
 *   1. normalize(nestedTree) -> { nodes, rootId }
 *      Flattens a nested view specification into a normalized map of nodes
 *      by stable ID. Each node has: tag, childIds, parentId, and all
 *      attributes/bindings as flat properties. This is the Ch15 pattern
 *      applied to the view layer.
 *
 *   2. resolveNode(node, getData) -> concreteNode
 *      Evaluates expressions, expands forEach templates, resolves text
 *      interpolation. Pure function: no DOM, no side effects.
 *
 * The normalized form is what gets written into EveryState:
 *   store.set('view.nodes.n1', { tag: 'div', childIds: ['n2','n3'], ... })
 *   store.set('view.rootId', 'n0')
 *
 * Then each node is independently subscribable:
 *   store.subscribe('view.nodes.n1.text', cb)  // surgical
 *
 * Copyright (c) 2025 Ajdin Imsirovic. MIT License.
 */

// == ID generation =====================================================

let _idCounter = 0;

export function resetIdCounter() {
  _idCounter = 0;
}

function generateNodeId() {
  return `v${_idCounter++}`;
}

// == Path utilities (pure) =============================================

export function getByPath(obj, path) {
  if (!path || !obj) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function interpolate(template, getData) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{([^}]+)\}/g, (_, expr) => {
    const val = safeEval(expr, getData);
    return val !== undefined ? String(val) : `{${expr}}`;
  });
}

function safeEval(expr, getData) {
  // Simple path resolution: 'todos.length', 'todo.text'
  // No eval() - only dot-path lookups and basic .length / .filter().length
  expr = expr.trim();

  // Handle .filter(fn).length pattern (must check BEFORE simple .length)
  const filterMatch = expr.match(/^(.+)\.filter\((\w+)\s*=>\s*(!?)(\w+)\.(\w+)\)\.length$/);
  if (!filterMatch && expr.endsWith('.length')) {
    // Handle simple .length
    const arrPath = expr.slice(0, -7);
    const arr = getData(arrPath);
    return Array.isArray(arr) ? arr.length : undefined;
  }
  if (filterMatch) {
    const [, arrPath, param, negate, paramRef, prop] = filterMatch;
    if (param !== paramRef) return undefined;
    const arr = getData(arrPath);
    if (!Array.isArray(arr)) return undefined;
    return negate
      ? arr.filter(item => !item[prop]).length
      : arr.filter(item => item[prop]).length;
  }

  // Simple path lookup
  return getData(expr);
}

// == Normalize: nested tree -> flat node map ============================

export function normalize(tree) {
  resetIdCounter();
  const nodes = {};
  const rootId = _normalizeNode(tree, null, nodes);
  return { nodes, rootId };
}

function _normalizeNode(spec, parentId, nodes) {
  if (!spec || typeof spec !== 'object') return null;

  const id = generateNodeId();
  const node = { id, parentId };

  // Copy scalar properties
  for (const key of Object.keys(spec)) {
    if (key === 'children' || key === 'template') continue;
    node[key] = spec[key];
  }

  // Handle forEach: store the template spec, children come from data
  if (spec.forEach) {
    // Store the raw template for expansion at resolve time
    node.template = spec.template ? JSON.parse(JSON.stringify(spec.template)) : null;
    node.childIds = []; // populated during resolve
  }
  // Handle static children
  else if (Array.isArray(spec.children)) {
    const childIds = [];
    for (const childSpec of spec.children) {
      const childId = _normalizeNode(childSpec, id, nodes);
      if (childId) childIds.push(childId);
    }
    node.childIds = childIds;
  } else {
    node.childIds = [];
  }

  nodes[id] = node;
  return id;
}

// == Flatten: write normalized nodes into an EveryState store ==========

export function flatten(tree, store, prefix = 'view') {
  const { nodes, rootId } = normalize(tree);
  const entries = {};
  entries[`${prefix}.rootId`] = rootId;
  for (const [id, node] of Object.entries(nodes)) {
    entries[`${prefix}.nodes.${id}`] = node;
  }
  if (store && typeof store.setMany === 'function') {
    store.setMany(entries);
  }
  return { nodes, rootId, entries };
}

// == Resolve: evaluate a single node against data ======================

export function resolveNode(node, getData) {
  if (!node) return null;
  const resolved = { ...node };

  // Resolve text interpolation
  if (typeof resolved.text === 'string') {
    if (resolved.text.includes('{')) {
      resolved.text = interpolate(resolved.text, getData);
    } else {
      // Check if it's a data reference (e.g., 'todo.text')
      const val = getData(resolved.text);
      if (val !== undefined && val !== resolved.text) {
        resolved.text = String(val);
      }
    }
  }

  // Resolve classIf
  if (resolved.classIf && typeof resolved.classIf === 'object') {
    const classes = resolved.class ? [resolved.class] : [];
    for (const [cls, condition] of Object.entries(resolved.classIf)) {
      if (getData(condition)) classes.push(cls);
    }
    resolved.class = classes.join(' ');
    delete resolved.classIf;
  }

  // Resolve bind value
  if (resolved.bind) {
    resolved.boundValue = getData(resolved.bind);
  }

  return resolved;
}

// == Resolve tree: expand forEach + resolve all nodes recursively ======

export function resolveTree(nodes, rootId, getData, context = {}) {
  const node = nodes[rootId];
  if (!node) return null;

  // Create a getData that includes context (for forEach variables)
  const contextGetData = (path) => {
    const parts = path.split('.');
    if (context[parts[0]] !== undefined) {
      let val = context[parts[0]];
      for (let i = 1; i < parts.length; i++) {
        if (val == null) return undefined;
        val = val[parts[i]];
      }
      return val;
    }
    return getData(path);
  };

  const resolved = resolveNode(node, contextGetData);

  // Handle forEach expansion
  if (resolved.forEach && resolved.template) {
    const items = getData(resolved.forEach);
    const as = resolved.as || 'item';
    resolved.children = [];

    if (Array.isArray(items)) {
      items.forEach((item, idx) => {
        const itemContext = { ...context, [as]: item, [`${as}Index`]: idx };
        // Normalize the template inline for this item
        const tempNodes = {};
        const tempId = _normalizeNode(resolved.template, resolved.id, tempNodes);
        // Resolve the temporary tree with item context
        const child = resolveTree(tempNodes, tempId, getData, itemContext);
        if (child) resolved.children.push(child);
      });
    }
    delete resolved.template;
    delete resolved.forEach;
    delete resolved.as;
  }
  // Handle static children
  else if (resolved.childIds && resolved.childIds.length > 0) {
    resolved.children = [];
    for (const childId of resolved.childIds) {
      const child = resolveTree(nodes, childId, getData, context);
      if (child) resolved.children.push(child);
    }
  } else {
    resolved.children = [];
  }

  return resolved;
}

// == Serialize: resolved tree -> HTML string (for SSR/snapshot) =========

export function serialize(resolvedNode, indent = 0) {
  if (!resolvedNode) return '';
  const pad = '  '.repeat(indent);
  const { tag, text, children } = resolvedNode;

  // Collect attributes
  const attrs = [];
  if (resolvedNode.class) attrs.push(`class="${resolvedNode.class}"`);
  if (resolvedNode.type) attrs.push(`type="${resolvedNode.type}"`);
  if (resolvedNode.placeholder) attrs.push(`placeholder="${resolvedNode.placeholder}"`);

  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';

  // Self-closing tags
  const selfClosing = new Set(['input', 'br', 'hr', 'img']);
  if (selfClosing.has(tag)) {
    return `${pad}<${tag}${attrStr} />`;
  }

  // Text-only node
  if (text && (!children || children.length === 0)) {
    return `${pad}<${tag}${attrStr}>${text}</${tag}>`;
  }

  // Node with children
  const lines = [`${pad}<${tag}${attrStr}>`];
  if (text) lines.push(`${pad}  ${text}`);
  for (const child of (children || [])) {
    lines.push(serialize(child, indent + 1));
  }
  lines.push(`${pad}</${tag}>`);
  return lines.join('\n');
}
