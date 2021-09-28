const TerserJs = require('terser-webpack-plugin');
const OptimizeCSSAssets = require('css-minimizer-webpack-plugin');

const terserOptions = {
  warnings: false,
  output: {
    comments: false
  },
  compress: {
    unused: true,
    comparisons: true,
    conditionals: true,
    negate_iife: false, // <- for `LazyParseWebpackPlugin()`
    dead_code: true,
    if_return: true,
    join_vars: true,
    evaluate: true,
    drop_console: true,
    passes: 2,
  },
  ie8: false,
  ecma: 8,
  mangle: true,
  module: true,
  toplevel: true,
};

module.exports = (wpc) => {
  const plugins = [];
  if (wpc.isProd) {
    plugins.push(
      new TerserJs({ terserOptions })
    );
    plugins.push(
      new OptimizeCSSAssets({})
    );
  }

  return {
    optimization: {
      minimize: (wpc.isProd === true),
      concatenateModules: (wpc.isProd === true),
      minimizer: plugins
    }
  };
};
