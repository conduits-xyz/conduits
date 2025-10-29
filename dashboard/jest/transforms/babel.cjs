// Custom Jest transform implementation that wraps babel-jest and injects our
// babel presets, so we don't have to use .babelrc.

const presets = [
  ['@babel/preset-env', {
    modules: 'commonjs',
    bugfixes: true,
    useBuiltIns: 'usage',
    targets: {
      esmodules: true,
      node: true
    },
    corejs: {
      version: '3.1',
      proposals: true
    }
  }],
  ['@babel/preset-react', {
    useBuiltIns: 'usage'
  }]
];

const plugins = [
  ['@babel/plugin-transform-react-jsx'],
  ['@babel/plugin-proposal-object-rest-spread', { useBuiltins: true }],
  ['@babel/plugin-syntax-dynamic-import']
];

const babelJest = require('babel-jest');

module.exports = babelJest.createTransformer({
  presets,
  plugins,
  babelrc: false,
  configFile: false
});
