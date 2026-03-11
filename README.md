# @everystate/view v1.1.2

**DOM structure as first-class state. DOMless resolve + surgical project.**

Treat your entire UI as state. Normalize view specifications into a flat map, store them in EveryState, and project to the DOM with surgical updates.

## Installation

```bash
npm install @everystate/view @everystate/core
```

## Quick Start (createApp)

The fastest way to get a reactive app running. One call does everything:

```js
import { createEveryState } from '@everystate/core';
import { createApp } from '@everystate/view/app';
import { increment } from './increment.js';
import { decrement } from './decrement.js';

const store = createEveryState({ count: 0 });

const { cleanup } = createApp(store, '#app', {
  tag: 'div', class: 'counter', css: { textAlign: 'center' },
  children: [
    { tag: 'h1', text: 'Counter: {count}' },
    { tag: 'button', text: '-', onClick: 'decrement' },
    { tag: 'span', text: '{count}', class: 'value',
      css: { fontSize: '3rem', fontWeight: '700' } },
    { tag: 'button', text: '+', onClick: 'increment' },
  ]
}, { increment, decrement });
```

`createApp` returns `{ store, cleanup }`. It wraps flatten + mount + intent auto-wiring + CSS extraction + handler auto-injection into a single call.

### What's new in v1.1.0

- **Co-located CSS** - Add `css: { ... }` to any view node with a `class`. `createApp` auto-extracts it to `css.{class}.{prop}` store paths (works with `@everystate/css` style engine).
- **Handler auto-inject** - Handler functions receive `store` as their first argument automatically. Write `export function increment(store) { ... }` and pass `{ increment }` - no manual wiring.
- **Return shape** - `createApp` now returns `{ store, cleanup }` instead of a bare cleanup function.
- **Signature B** - `createApp(el, initialState, viewSpec, handlers)` can create the store for you (call `createApp.use(createEveryState)` first).

## Declarative `show` binding

Toggle element visibility based on a store path. No refs, no manual class toggling:

```js
{ tag: 'div', class: 'panel', show: 'ui.panelOpen', children: [
  { tag: 'p', text: 'This panel is visible when ui.panelOpen is truthy' }
]}
```

The engine subscribes to the path and sets `display: none` when falsy, restores when truthy.

## Advanced usage (flatten + mount)

For full control, use the lower-level API directly:

```js
import { createEveryState } from '@everystate/core';
import { flatten } from '@everystate/view/resolve';
import { mount } from '@everystate/view/project';

const store = createEveryState({});

flatten({
  tag: 'div',
  children: [
    { tag: 'h1', text: 'Hello' },
    { tag: 'p', text: 'World' }
  ]
}, store, 'view');

const cleanup = mount(store, 'view', document.getElementById('app'), {});
```

## Why View-as-State?

- **DOMless testing** - Assert on view tree in Node.js, no browser required
- **Surgical updates** - Only changed nodes re-render
- **State-driven** - View is just another part of your state tree
- **Framework-free** - Works with vanilla JS or any framework

## Documentation

Full documentation available at [everystate.dev](https://everystate.dev).

## Ecosystem

| Package | Description | License |
|---|---|---|
| [@everystate/aliases](https://www.npmjs.com/package/@everystate/aliases) | Ergonomic single-character and short-name DOM aliases for vanilla JS | MIT |
| [@everystate/angular](https://www.npmjs.com/package/@everystate/angular) | Angular adapter: `usePath`, `useIntent`, `useWildcard`, `useAsync` — bridges store to Angular signals | MIT |
| [@everystate/core](https://www.npmjs.com/package/@everystate/core) | Path-based state management with wildcard subscriptions and async support | MIT |
| [@everystate/css](https://www.npmjs.com/package/@everystate/css) | Reactive CSSOM engine: design tokens, typed validation, WCAG enforcement, all via path-based state | MIT |
| [@everystate/examples](https://www.npmjs.com/package/@everystate/examples) | Example applications and patterns | MIT |
| [@everystate/perf](https://www.npmjs.com/package/@everystate/perf) | Performance monitoring overlay | MIT |
| [@everystate/react](https://www.npmjs.com/package/@everystate/react) | React hooks adapter: `usePath`, `useIntent`, `useAsync` hooks and `EventStateProvider` | MIT |
| [@everystate/renderer](https://www.npmjs.com/package/@everystate/renderer) | Direct-binding reactive renderer: `bind-*`, `set`, `each` attributes. Zero build step | MIT |
| [@everystate/router](https://www.npmjs.com/package/@everystate/router) | SPA routing as state | MIT |
| [@everystate/solid](https://www.npmjs.com/package/@everystate/solid) | Solid adapter: `usePath`, `useIntent`, `useWildcard`, `useAsync` — bridges store to Solid signals | MIT |
| [@everystate/test](https://www.npmjs.com/package/@everystate/test) | Event-sequence testing for EveryState stores. Zero dependency. | MIT |
| [@everystate/types](https://www.npmjs.com/package/@everystate/types) | Typed dot-path autocomplete for EveryState stores | MIT |
| [@everystate/view](https://www.npmjs.com/package/@everystate/view) | State-driven view: DOMless resolve + surgical DOM projector. View tree as first-class state | MIT |
| [@everystate/vue](https://www.npmjs.com/package/@everystate/vue) | Vue 3 composables adapter: `provideStore`, `usePath`, `useIntent`, `useWildcard`, `useAsync` | MIT |

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
