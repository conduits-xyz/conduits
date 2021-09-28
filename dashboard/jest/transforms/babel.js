// See https://github.com/facebook/jest/issues/1468
// ^^^ solution provided by @nfarina
//
// Custom Jest transform implementation that wraps babel-jest and injects our
// babel presets, so we don't have to use .babelrc.
//

const presets = [
  ['@babel/preset-env', {
    modules: 'commonjs',  /* transpile ES6 for Jest */
    bugfixes: true,       /* see https://babeljs.io/docs/en/babel-preset-env#bugfixes */
    useBuiltIns: 'usage', /* disable polyfills; target the latest and greatest! */
    // debug: true,
    targets: {
      esmodules: true,
      node: true,
    },
    corejs: {
      version: '3.1', proposals: true
    },
  }],
  ['@babel/preset-react', {
    useBuiltIns: 'usage'
  }],
];

const plugins = [
  ['@babel/plugin-transform-react-jsx'],
  ['@babel/plugin-proposal-object-rest-spread', { useBuiltins: true }],
  ['@babel/plugin-syntax-dynamic-import'],
];

import babelJestMd from 'babel-jest';
const babelJest = babelJestMd.__esModule ? babelJestMd.default : babelJestMd;

export default babelJest.createTransformer({
  presets,
  plugins,
  babelrc: false,
  configFile: false,
});

// module.exports = transformer;
