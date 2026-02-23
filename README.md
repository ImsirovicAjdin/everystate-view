# @everystate/view

**DOM structure as first-class state. DOMless resolve + surgical project.**

Treat your entire UI as state. Normalize view specifications into a flat map, store them in EveryState, and project to the DOM with surgical updates.

## Installation

```bash
npm install @everystate/view @everystate/core
```

## Quick Start

```js
import { createEventState } from '@everystate/core';
import { flatten, resolveTree, project } from '@everystate/view';

const store = createEventState({});

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

- **DOMless testing** — Assert on view tree in Node.js, no browser required
- **Surgical updates** — Only changed nodes re-render
- **State-driven** — View is just another part of your state tree
- **Framework-free** — Works with vanilla JS or any framework

## License

MIT © Ajdin Imsirovic
