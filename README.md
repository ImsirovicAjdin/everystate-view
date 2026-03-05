# @everystate/view v1.0.4

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
| [@everystate/renderer](https://www.npmjs.com/package/@everystate/renderer) | Direct-binding reactive renderer: `bind-*`, `set`, `each` attributes. Zero build step | MIT |
| [@everystate/router](https://www.npmjs.com/package/@everystate/router) | SPA routing as state | MIT |
| [@everystate/test](https://www.npmjs.com/package/@everystate/test) | Event-sequence testing for EveryState stores. Zero dependency. | MIT |
| [@everystate/view](https://www.npmjs.com/package/@everystate/view) | State-driven view: DOMless resolve + surgical DOM projector. View tree as first-class state | MIT |

## Self-test (CLI, opt-in)

The self-test verifies the pure, DOMless `resolve.js` module:
normalize, resolveNode, resolveTree, serialize, getByPath,
interpolate, flatten, and extractDataPaths.
It is **zero-dependency** - no `@everystate/core` or DOM required.
It is **opt-in** and never runs automatically on install:

```bash
# via npx (no install needed)
npx everystate-view-self-test

# if installed locally
everystate-view-self-test

# or directly
node node_modules/@everystate/view/self-test.js
```

You can also run the npm script from the package folder:

```bash
npm --prefix node_modules/@everystate/view run self-test
```

### Integration tests (@everystate/test)

The `tests/` folder contains a separate integration suite that uses
`@everystate/test` and `@everystate/core` (declared as `devDependencies` / `peerDependencies`).
The **self-test** stays zero-dependency, while integration tests
remain available for deeper store-level validation.

**For end users** (after installing the package):

```bash
# Install test dependency
npm install @everystate/test

# Run from package folder
cd node_modules/@everystate/view
npm run test:integration
# or short alias
npm run test:i
```

Or, from your project root:

```bash
npm --prefix node_modules/@everystate/view run test:integration
```

**For package developers** (working in the source repo):

```bash
npm install
npm run test:integration
```

## License

MIT © Ajdin Imsirovic
