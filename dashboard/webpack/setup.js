/**
 * Webpack configuration that is mostly common for both production and
 * development builds.
 */
const webpack = require('webpack');
const Analyze = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const { CleanWebpackPlugin: Clean } = require('clean-webpack-plugin');
const Copy = require('copy-webpack-plugin');
const HTML = require('html-webpack-plugin');
const SuppressChunk = require('./plugins/suppress-chunk-plugin');
const InlineCriticalCss = require('html-inline-css-webpack-plugin').default;

const AnalyzerOptions = {
  analyzerMode: 'static',
  openAnalyzer: false,
  reportFilename: 'bundle-analysis.html',
};

const HtmlOptions = {
  inject: false,
  minify: {
    removeComments: true,
    collapseWhitespace: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    removeEmptyAttributes: true,
    removeStyleLinkTypeAttributes: true,
    keepClosingSlash: true,
    minifyJS: true,
    minifyCSS: true,
    minifyURLs: true,
  },
  manifest: {
    // TODO: figure out a better a way to manage this
    theme_color: '#673AB8',
  },
};

// assets that are not detected by webpack as being part of the build
// chain will need to be copied manually.
const assets = (wpc) => {
  const globOptions = {
    ignore: ['*.scss'],
  };

  const ifDev = true; // !wpc.isProd;

  return {
    patterns: [
      { context: wpc.web, from: 'favicon.ico', noErrorOnMissing: ifDev },
      {
        context: wpc.web,
        from: 'assets/branding/*.*',
        noErrorOnMissing: ifDev,
        globOptions,
      },
      {
        context: wpc.web,
        from: 'assets/images/*.*',
        globOptions,
        noErrorOnMissing: ifDev
      },
    ],
  };
};

// see https://webpack.js.org/configuration/ for bail
// see https://webpack.js.org/configuration/stats/ for stats

// @param {wpc} paths, locations, options
module.exports = (wpc) => {
  const alias = {
    // alias to api
    api: `${wpc.root}/api`,

    // alias to app root
    app: wpc.app,

    // alias to 'custom' hooks
    hooks: `${wpc.root}/hooks`,

    // alias to mocks
    mocks: `${wpc.root}/mocks`,

    // alias to components
    components: `${wpc.app}/components`,

    // alias to store
    store: `${wpc.root}/store`,

    // we keep web assets here (including icon-font files)
    // this aliasing is needed for file-loader or url-loader
    // to import correctly without having to use an absolute path
    web: wpc.web,

    // library contains useful stuff
    lib: wpc.lib,
  };

  const extensions = ['.jsx', '.js', '.json', '.scss', '.css', '.html'];

  return {
    mode: wpc.mode,
    bail: true /* fail on first error instead of tolerating it */,
    stats: {
      children: false,
    },

    entry: {
      // NOTE:
      // - order here determines the inject order of insertions
      // - main.scss typically contains PRPL related css
      // - main.scss is inlined using html-inline-css-webpack-plugin
      main: `${wpc.app}/main.scss`,
      app: `${wpc.app}/main.js`,
    },

    performance: {
      // NOTE:
      // Webpack's default 250KiB limit is pretty arbitrary for the combined
      // asset size... increasing it to 500KiB
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    },

    output: {
      // See notes in styles.js for tradeoffs on output naming
      // conventions
      path: wpc.build,
      filename: '[name].js',
      // filename: '[name].[hash].js',
      publicPath: '',
    },

    resolve: {
      extensions,
      alias,
    },

    optimization: {
      splitChunks: {
        cacheGroups: {
          react: { // react stuff
            test: /[\\/]node_modules[\\/]((react).*)[\\/]/,
            name: 'react',
            chunks: 'all',
            enforce: true,
          },
          ndeps: { // the rest of the stuff from node_modules
            test: /[\\/]node_modules[\\/]((?!react).*)[\\/]/,
            name: 'ndeps',
            chunks: 'all',
            enforce: true,
          },
        },
      },
    },
    plugins: [
      new webpack.ProvidePlugin({ React: 'react' }),
      new Clean({ root: wpc.root, verbose: true }),
      new SuppressChunk([
        { name: 'main', match: /\.js$/ },
      ]),
      new HTML({ template: `${wpc.web}/index.html`, ...HtmlOptions }),
      new InlineCriticalCss({
        position: 'after',
        filter(filename) {
          return /^main.*.css/.test(filename) || /index.html/.test(filename);
        },
      }),
      new Copy(assets(wpc)),
      new Analyze(AnalyzerOptions),
    ],
  };
};
