/**
 * @everystate/view: project.js
 *
 * DOM projector for normalized view trees stored in EveryState.
 *
 * Follows the normalized createNodeElement(nodeId) pattern:
 *   - Each view node gets its own EveryState subscriptions
 *   - Changing view.nodes.n3.text only updates that one DOM element
 *   - Children are ID arrays: changing childIds reconciles the DOM
 *   - Event delegation for handlers (click, enter, input)
 *
 * Usage:
 *   import { flatten } from '@everystate/view/resolve';
 *   import { mount } from '@everystate/view/project';
 *
 *   flatten(viewTree, store, 'view');
 *   const cleanup = mount(store, 'view', container, handlers);
 *
 * Copyright (c) 2026 Ajdin Imsirovic. MIT License.
 */

// Path utilities

function getByPath(obj, path) {
  if (!path || !obj) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolateText(template, store) {
  if (typeof template !== 'string') return String(template ?? '');
  return template.replace(/\{([^}]+)\}/g, (_, expr) => {
    expr = expr.trim();
    // .filter(x => x.prop).length  (must check BEFORE simple .length)
    const fm = expr.match(/^(.+)\.filter\((\w+)\s*=>\s*(!?)(\w+)\.(\w+)\)\.length$/);
    if (fm) {
      const [, arrPath, p, neg, pRef, prop] = fm;
      if (p !== pRef) return `{${expr}}`;
      const arr = store.get(arrPath);
      if (!Array.isArray(arr)) return `{${expr}}`;
      return neg ? arr.filter(i => !i[prop]).length : arr.filter(i => i[prop]).length;
    }
    // .length (simple)
    if (expr.endsWith('.length')) {
      const arr = store.get(expr.slice(0, -7));
      return Array.isArray(arr) ? arr.length : `{${expr}}`;
    }
    const val = store.get(expr);
    return val !== undefined ? String(val) : `{${expr}}`;
  });
}

// Data-dependency extraction: find store paths referenced in {expressions}

export function extractDataPaths(textSpec) {
  if (typeof textSpec !== 'string') return [];
  const paths = new Set();
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(textSpec)) !== null) {
    let expr = m[1].trim();
    // '{todos.filter(t => t.done).length}' → root path 'todos'
    const filterMatch = expr.match(/^(.+)\.filter\(/);
    if (filterMatch) {
      paths.add(filterMatch[1]);
      continue;
    }
    // '{todos.length}' → root path 'todos'
    if (expr.endsWith('.length')) {
      paths.add(expr.slice(0, -7));
      continue;
    }
    // '{title}' → path 'title'
    // '{user.name}' → path 'user.name'
    if (expr) paths.add(expr);
  }
  return [...paths];
}

// Helpers

const HTML_TAG_RE = /<[a-z][\s\S]*?>/i;

function setTextContent(el, text) {
  if (HTML_TAG_RE.test(text)) {
    el.innerHTML = text;
  } else {
    el.textContent = text;
  }
}

// Mount

export function mount(store, prefix, container, handlers = {}, components = {}) {
  const subs = [];     // { unsub }
  const nodeEls = {};  // nodeId -> DOM element

  function addSub(path, cb) {
    const unsub = store.subscribe(path, cb);
    subs.push({ unsub });
    return unsub;
  }

  // Resolve text: data references or interpolation

  function resolveText(textSpec, itemContext) {
    if (!textSpec) return '';
    if (typeof textSpec !== 'string') return String(textSpec);

    // Interpolation: 'Total: {todos.length}'
    if (textSpec.includes('{')) {
      if (itemContext) {
        // Replace context refs first, e.g., {todo.text}
        let result = textSpec;
        result = result.replace(/\{([^}]+)\}/g, (_, expr) => {
          const ctxVal = resolveContextPath(expr.trim(), itemContext);
          if (ctxVal !== undefined) return String(ctxVal);
          return `{${expr}}`;
        });
        if (result.includes('{')) {
          return interpolateText(result, store);
        }
        return result;
      }
      return interpolateText(textSpec, store);
    }

    // Data reference: 'todo.text' -> look up in context, then store
    if (itemContext) {
      const ctxVal = resolveContextPath(textSpec, itemContext);
      if (ctxVal !== undefined) return String(ctxVal);
    }
    const storeVal = store.get(textSpec);
    if (storeVal !== undefined && storeVal !== textSpec) return String(storeVal);
    return textSpec;
  }

  function resolveContextPath(path, context) {
    if (!context || !path) return undefined;
    const parts = path.split('.');
    if (context[parts[0]] === undefined) return undefined;
    let val = context[parts[0]];
    for (let i = 1; i < parts.length; i++) {
      if (val == null) return undefined;
      val = val[parts[i]];
    }
    return val;
  }

  // Call handler

  function callHandler(handlerStr, itemContext, event) {
    if (!handlerStr) { console.warn('[callHandler] no handlerStr'); return; }
    const match = handlerStr.match(/^([\w.]+)(?:\(([^)]*)\))?$/);
    if (!match) { console.warn('[callHandler] no match for:', handlerStr); return; }
    const [, name, argsStr] = match;
    const handler = handlers[name];
    if (!handler) { console.warn('[callHandler] no handler for:', name, 'available:', Object.keys(handlers)); return; }

    if (argsStr) {
      let argVal;
      if (itemContext) {
        argVal = resolveContextPath(argsStr.trim(), itemContext);
      }
      if (argVal === undefined) {
        argVal = store.get(argsStr.trim());
      }
      // Fall back to the literal string (e.g. 'sortByCol(name)' → 'name')
      if (argVal === undefined) {
        argVal = argsStr.trim();
      }
      handler(argVal, event);
    } else {
      handler(event);
    }
  }

  // Create DOM element for a view node

  function createNodeElement(nodeId, itemContext) {
    const nodePath = `${prefix}.nodes.${nodeId}`;
    const nodeData = store.get(nodePath);
    if (!nodeData) return null;

    // Component escape hatch: delegate to imperative mount function
    if (nodeData.component) {
      const el = document.createElement(nodeData.tag || 'div');
      nodeEls[nodeId] = el;
      el.dataset.viewId = nodeId;
      el.dataset.component = nodeData.component;
      if (nodeData.class) el.className = nodeData.class;
      const mountFn = components[nodeData.component];
      if (mountFn) {
        const teardown = mountFn(store, el);
        if (typeof teardown === 'function') subs.push({ unsub: teardown });
      } else {
        console.warn(`[mount] no component registered for: "${nodeData.component}"`);
      }
      return el;
    }

    // forEach nodes: expand from data
    if (nodeData.forEach) {
      return createForEachElement(nodeId, nodeData);
    }

    const el = document.createElement(nodeData.tag || 'div');
    nodeEls[nodeId] = el;
    el.dataset.viewId = nodeId;

    // Set initial attributes
    applyAttributes(el, nodeData, itemContext);

    // Declarative show/hide binding
    if (nodeData.show) {
      const showPath = nodeData.show;
      const showVal = itemContext
        ? resolveContextPath(showPath, itemContext) ?? store.get(showPath)
        : store.get(showPath);
      if (!showVal) el.style.display = 'none';

      if (!itemContext) {
        addSub(showPath, (val) => {
          el.style.display = val ? '' : 'none';
        });
      }
    }

    // Text content
    if (nodeData.text) {
      setTextContent(el, resolveText(nodeData.text, itemContext));
    }

    // Bind (two-way)
    if (nodeData.bind) {
      const bindPath = itemContext
        ? resolveBindPath(nodeData.bind, itemContext)
        : nodeData.bind;

      if (bindPath) {
        applyBind(el, nodeData, bindPath);
      }
    }

    // Event handlers
    if (nodeData.onClick) {
      console.log('[mount] attaching onClick:', nodeData.onClick, 'to', nodeData.tag, el);
      el.addEventListener('click', (e) => callHandler(nodeData.onClick, itemContext, e));
    }
    if (nodeData.onDblClick) {
      el.addEventListener('dblclick', (e) => callHandler(nodeData.onDblClick, itemContext, e));
    }
    if (nodeData.onBlur) {
      el.addEventListener('blur', (e) => callHandler(nodeData.onBlur, itemContext, e));
    }
    if (nodeData.onEnter) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') callHandler(nodeData.onEnter, itemContext, e);
      });
    }
    if (nodeData.onDragStart) {
      el.addEventListener('dragstart', (e) => callHandler(nodeData.onDragStart, itemContext, e));
    }
    if (nodeData.onDragEnd) {
      el.addEventListener('dragend', (e) => callHandler(nodeData.onDragEnd, itemContext, e));
    }
    if (nodeData.onDragOver) {
      el.addEventListener('dragover', (e) => callHandler(nodeData.onDragOver, itemContext, e));
    }
    if (nodeData.onDragLeave) {
      el.addEventListener('dragleave', (e) => callHandler(nodeData.onDragLeave, itemContext, e));
    }
    if (nodeData.onDrop) {
      el.addEventListener('drop', (e) => callHandler(nodeData.onDrop, itemContext, e));
    }

    // Subscribe to text changes (surgical update)
    if (nodeData.text && !itemContext) {
      const updateText = () => {
        const updated = store.get(nodePath);
        if (updated && updated.text) {
          setTextContent(el, resolveText(updated.text, itemContext));
        }
      };

      // 1. Subscribe to view-node text changes (someone writes to the node)
      addSub(`${nodePath}.text`, updateText);

      // 2. Subscribe to data paths referenced in {expressions}
      //    e.g. '{todos.length}' → subscribe to 'todos'
      //    e.g. '{todos.filter(t => t.done).length}' → subscribe to 'todos'
      const dataPaths = extractDataPaths(nodeData.text);
      for (const dp of dataPaths) {
        addSub(dp, updateText);
      }
    }

    // Subscribe to class changes
    if (!itemContext) {
      addSub(`${nodePath}.class`, () => {
        const updated = store.get(nodePath);
        if (updated) el.className = updated.class || '';
      });
    }

    // Children
    if (nodeData.childIds && nodeData.childIds.length > 0) {
      const childContainer = el;
      for (const childId of nodeData.childIds) {
        const childData = store.get(`${prefix}.nodes.${childId}`);
        if (childData && childData.forEach && !childData.tag) {
          // Fragment forEach: expand items inline (no wrapper element)
          const startMarker = document.createComment(`fragment-${childId}-start`);
          const endMarker = document.createComment(`fragment-${childId}-end`);
          childContainer.appendChild(startMarker);
          const fragAs = childData.as || 'item';
          const renderFragment = () => {
            while (startMarker.nextSibling && startMarker.nextSibling !== endMarker) {
              startMarker.nextSibling.remove();
            }
            const items = store.get(childData.forEach);
            if (Array.isArray(items) && childData.template) {
              items.forEach((item, idx) => {
                const ctx = { ...itemContext, [fragAs]: item, [`${fragAs}Index`]: idx };
                const childEl = createTemplateElement(childData.template, childId, ctx);
                if (childEl) childContainer.insertBefore(childEl, endMarker);
              });
            }
          };
          childContainer.appendChild(endMarker);
          renderFragment();
          addSub(childData.forEach, renderFragment);
        } else {
          const childEl = createNodeElement(childId, itemContext);
          if (childEl) childContainer.appendChild(childEl);
        }
      }

      // Subscribe to childIds changes (structural reconciliation)
      if (!itemContext) {
        addSub(`${nodePath}.childIds`, (newChildIds) => {
          reconcileChildren(childContainer, nodeId, newChildIds || [], itemContext);
        });
      }
    }

    return el;
  }

  // forEach expansion

  function createForEachElement(nodeId, nodeData) {
    // Create the parent element (e.g. <ul>) so items stay inside it
    const el = document.createElement(nodeData.tag || 'div');
    nodeEls[nodeId] = el;
    el.dataset.viewId = nodeId;
    if (nodeData.class) el.className = nodeData.class;

    const items = store.get(nodeData.forEach);
    const as = nodeData.as || 'item';

    function renderItems(container, dataItems) {
      container.innerHTML = '';
      if (Array.isArray(dataItems) && nodeData.template) {
        dataItems.forEach((item, idx) => {
          const itemContext = { [as]: item, [`${as}Index`]: idx };
          const childEl = createTemplateElement(nodeData.template, nodeId, itemContext);
          if (childEl) container.appendChild(childEl);
        });
      }
    }

    renderItems(el, items);

    // Subscribe to the data array for re-expansion
    addSub(nodeData.forEach, () => {
      const newItems = store.get(nodeData.forEach);
      renderItems(el, newItems);
    });

    return el;
  }

  // Create element from a template spec (for forEach items)

  function createTemplateElement(templateSpec, parentNodeId, itemContext) {
    // Component escape hatch inside templates
    if (templateSpec && templateSpec.component) {
      const el = document.createElement(templateSpec.tag || 'div');
      if (templateSpec.class) el.className = templateSpec.class;
      el.dataset.component = templateSpec.component;
      const mountFn = components[templateSpec.component];
      if (mountFn) {
        const teardown = mountFn(store, el);
        if (typeof teardown === 'function') subs.push({ unsub: teardown });
      }
      return el;
    }
    if (!templateSpec || !templateSpec.tag) return null;

    const el = document.createElement(templateSpec.tag);

    // Class + classIf
    if (templateSpec.class) el.className = templateSpec.class;
    if (templateSpec.classIf) {
      for (const [cls, condition] of Object.entries(templateSpec.classIf)) {
        if (resolveContextPath(condition, itemContext)) {
          el.classList.add(cls);
        }
      }
    }

    // Declarative show/hide for template items
    if (templateSpec.show) {
      const showVal = resolveContextPath(templateSpec.show, itemContext) ?? store.get(templateSpec.show);
      if (!showVal) el.style.display = 'none';
    }

    // Attributes
    if (templateSpec.type) el.type = templateSpec.type;
    if (templateSpec.placeholder) el.placeholder = templateSpec.placeholder;
    if (templateSpec.draggable) el.draggable = true;

    // Text
    if (templateSpec.text) {
      setTextContent(el, resolveText(templateSpec.text, itemContext));
    }

    // Bind
    if (templateSpec.bind) {
      const bindPath = resolveBindPath(templateSpec.bind, itemContext);
      if (bindPath) applyBind(el, templateSpec, bindPath);
    }

    // Events
    if (templateSpec.onClick) {
      el.addEventListener('click', (e) => callHandler(templateSpec.onClick, itemContext, e));
    }
    if (templateSpec.onDblClick) {
      el.addEventListener('dblclick', (e) => callHandler(templateSpec.onDblClick, itemContext, e));
    }
    if (templateSpec.onBlur) {
      el.addEventListener('blur', (e) => callHandler(templateSpec.onBlur, itemContext, e));
    }
    if (templateSpec.onEnter) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') callHandler(templateSpec.onEnter, itemContext, e);
      });
    }
    if (templateSpec.onDragStart) {
      el.addEventListener('dragstart', (e) => callHandler(templateSpec.onDragStart, itemContext, e));
    }
    if (templateSpec.onDragEnd) {
      el.addEventListener('dragend', (e) => callHandler(templateSpec.onDragEnd, itemContext, e));
    }
    if (templateSpec.onDragOver) {
      el.addEventListener('dragover', (e) => callHandler(templateSpec.onDragOver, itemContext, e));
    }
    if (templateSpec.onDragLeave) {
      el.addEventListener('dragleave', (e) => callHandler(templateSpec.onDragLeave, itemContext, e));
    }
    if (templateSpec.onDrop) {
      el.addEventListener('drop', (e) => callHandler(templateSpec.onDrop, itemContext, e));
    }

    // Recursive children
    if (Array.isArray(templateSpec.children)) {
      for (const childSpec of templateSpec.children) {
        if (childSpec.forEach) {
          // Nested forEach: expand items inline with reactive updates
          const startMarker = document.createComment('nested-start');
          const endMarker = document.createComment('nested-end');
          el.appendChild(startMarker);
          const nestedAs = childSpec.as || 'item';
          const renderNested = () => {
            while (startMarker.nextSibling && startMarker.nextSibling !== endMarker) {
              startMarker.nextSibling.remove();
            }
            const items = store.get(childSpec.forEach);
            if (Array.isArray(items) && childSpec.template) {
              items.forEach((item, idx) => {
                const nestedContext = { ...itemContext, [nestedAs]: item, [`${nestedAs}Index`]: idx };
                const childEl = createTemplateElement(childSpec.template, parentNodeId, nestedContext);
                if (childEl) el.insertBefore(childEl, endMarker);
              });
            }
          };
          el.appendChild(endMarker);
          renderNested();
          addSub(childSpec.forEach, renderNested);
        } else {
          const childEl = createTemplateElement(childSpec, parentNodeId, itemContext);
          if (childEl) el.appendChild(childEl);
        }
      }
    }

    return el;
  }

  // Helpers

  function applyAttributes(el, nodeData, itemContext) {
    if (nodeData.class) el.className = nodeData.class;
    if (nodeData.classIf && typeof nodeData.classIf === 'object') {
      for (const [cls, condition] of Object.entries(nodeData.classIf)) {
        const val = itemContext
          ? resolveContextPath(condition, itemContext)
          : store.get(condition);
        if (val) el.classList.add(cls);
      }
    }
    if (nodeData.type) el.type = nodeData.type;
    if (nodeData.placeholder) el.placeholder = nodeData.placeholder;
    if (nodeData.draggable) el.draggable = true;
  }

  function applyBind(el, nodeData, path) {
    const val = store.get(path);
    const tag = nodeData.tag;
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (isInput) {
      if (nodeData.type === 'checkbox') {
        el.checked = !!val;
      } else {
        el.value = val != null ? String(val) : '';
      }
      el.addEventListener('input', (e) => {
        const newVal = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        store.set(path, newVal);
      });
    } else {
      // Non-input: one-way display binding via textContent
      el.textContent = val != null ? String(val) : '';
    }

    // Subscribe for external changes
    addSub(path, (v) => {
      if (isInput) {
        if (document.activeElement === el) return; // avoid cursor jump
        if (nodeData.type === 'checkbox') {
          el.checked = !!v;
        } else {
          const s = v != null ? String(v) : '';
          if (el.value !== s) el.value = s;
        }
      } else {
        el.textContent = v != null ? String(v) : '';
      }
    });
  }

  function resolveBindPath(bindSpec, itemContext) {
    if (!bindSpec) return null;
    // Support {context} interpolation (same syntax as resolveText)
    if (bindSpec.includes('{') && itemContext) {
      const resolved = bindSpec.replace(/\{([^}]+)\}/g, (_, expr) => {
        const ctxVal = resolveContextPath(expr.trim(), itemContext);
        return ctxVal !== undefined ? String(ctxVal) : `{${expr}}`;
      });
      if (!resolved.includes('{')) return resolved;
      return null;
    }
    if (itemContext) {
      const parts = bindSpec.split('.');
      if (itemContext[parts[0]] !== undefined) {
        // This is a context-relative bind: we need to find the store path
        // For now, return the direct store path if item has an id
        const item = itemContext[parts[0]];
        if (item && typeof item === 'object' && item.id !== undefined) {
          // Convention: bind 'todo.done' -> store path for that todo's done field
          return null; // Context binds are handled inline
        }
      }
    }
    return bindSpec;
  }

  function reconcileChildren(container, parentNodeId, newChildIds, itemContext) {
    // Simple reconciliation: clear and rebuild
    // (Production would diff by key)
    container.innerHTML = '';
    for (const childId of newChildIds) {
      const childEl = createNodeElement(childId, itemContext);
      if (childEl) container.appendChild(childEl);
    }
  }

  // Init: render the root

  const rootId = store.get(`${prefix}.rootId`);
  if (rootId) {
    const rootEl = createNodeElement(rootId);
    if (rootEl) container.appendChild(rootEl);
  }

  // Cleanup
  return function cleanup() {
    for (const { unsub } of subs) unsub();
    subs.length = 0;
    container.innerHTML = '';
  };
}
