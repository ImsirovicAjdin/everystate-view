#!/usr/bin/env node

/**
 * @everystate/view CLI - opt-in self-test
 *
 * Usage:
 *   npx everystate-view-self-test          # run self-test
 *   npx everystate-view-self-test --help   # show help
 */

(async () => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
@everystate/view - self-test CLI

Usage:
  everystate-view-self-test          Run the bundled self-test
  everystate-view-self-test --help   Show this help message

The self-test verifies the pure, DOMless resolve.js module:
normalize, resolveNode, resolveTree, serialize, getByPath,
interpolate, flatten, and extractDataPaths from project.js.

It is zero-dependency - no @everystate/core or DOM required.
It is opt-in and never runs automatically on install.
`.trim());
    process.exit(0);
  }

  try {
    await import('./self-test.js');
  } catch (err) {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  }
})();
