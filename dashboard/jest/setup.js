
// This file is resolved by Jest before the test environment has beeen
// setup... so the resolution of whether this file is treated as a ESM
// or CommonJS is dependent on the type set in package.json or the
// default mode of node.

// NOTE: do not upgrade 'node-fetch' to the latest ESM only bundle!!
// Jest doesn't completely support ESM and thus uses babel to convert
// ESM to CJS... which leads import errors deep down.
import fetch from 'node-fetch';

// patch global object in node, this just needs to be done somewhere
// before the actual tests run... and this is the first place where we
// can do this close to `fetch` import without getting import reorder
// warning...

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
}

if (typeof window !== "undefined" && !window.fetch) {
  window.fetch = fetch;
}

// uncomment and check the squiggles appear, otherwise Jest ain't gonna work!
// console.log('~~~~~~~~~~');

