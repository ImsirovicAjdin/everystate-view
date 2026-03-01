# @everystate/view

**DOM structure as first-class state. DOMless resolve + surgical project.**

Treat your entire UI as state. Normalize view specifications into a flat map, store them in EveryState, and project to the DOM with surgical updates.

## Installation

```bash
npm install @everystate/view @everystate/core
```

## Quick Start

```js
import { createEveryState } from '@everystate/core';
import { flatten, resolveTree, project } from '@everystate/view';

const store = createEveryState({});

// Define view as nested structure
const viewSpec = {
  tag: 'div',
  children: [
    { tag: 'h1', text: 'Hello' },
    { tag: 'p', text: 'World' }
  ]
};

// Flatten to state
flatten(store, viewSpec, 'view.root');

// Resolve to concrete tree
const tree = resolveTree(store, 'view.root');

// Project to DOM
const container = document.getElementById('app');
project(store, 'view.root', container);
```

## Why View-as-State?

- **DOMless testing** - Assert on view tree in Node.js, no browser required
- **Surgical updates** - Only changed nodes re-render
- **State-driven** - View is just another part of your state tree
- **Framework-free** - Works with vanilla JS or any framework

## Ecosystem

| Package | Description | License |
|---|---|---|
| [@everystate/aliases](https://www.npmjs.com/package/@everystate/aliases) | Ergonomic single-character and short-name DOM aliases for vanilla JS | MIT |
| [@everystate/core](https://www.npmjs.com/package/@everystate/core) | Path-based state management with wildcard subscriptions and async support. Core state engine (you are here). | MIT |
| [@everystate/css](https://www.npmjs.com/package/@everystate/css) | Reactive CSSOM engine: design tokens, typed validation, WCAG enforcement, all via path-based state | MIT |
| [@everystate/examples](https://www.npmjs.com/package/@everystate/examples) | Example applications and patterns | MIT |
| [@everystate/perf](https://www.npmjs.com/package/@everystate/perf) | Performance monitoring overlay | MIT |
| [@everystate/react](https://www.npmjs.com/package/@everystate/react) | React hooks adapter: `usePath`, `useIntent`, `useAsync` hooks and `EveryStateProvider` | MIT |
| [@everystate/renderer](https://www.npmjs.com/package/@everystate/renderer) | Direct-binding reactive renderer: `bind-*`, `set`, `each` attributes. Zero build step | Proprietary |
| [@everystate/router](https://www.npmjs.com/package/@everystate/router) | SPA routing as state | MIT |
| [@everystate/test](https://www.npmjs.com/package/@everystate/test) | Event-sequence testing for EveryState stores. Zero dependency. | Proprietary |
| [@everystate/view](https://www.npmjs.com/package/@everystate/view) | State-driven view: DOMless resolve + surgical DOM projector. View tree as first-class state | MIT |

## License

MIT © Ajdin Imsirovic
