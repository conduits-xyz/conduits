const { merge } = require('webpack-merge');
const path = require('path');

// uncomment next line to find the source of a deprecation
// process.traceDeprecation = true;

module.exports = (env, argv) => {
  const isProd = env && env.production;
  const mode = isProd ? 'production' : 'development';

  // many dependencies make decisions based on NODE_ENV, so set it here.
  process.env.NODE_ENV = mode;

  const root = path.join(__dirname, '../src');
  const app = path.join(root, 'app');
  const cfg = path.join(root, 'cfg');
  const web = path.join(root, 'web');
  const lib = path.join(root, 'lib');
  const build = path.join(root, '../', 'build');

  // webpack based project configuration
  const options = {
    inlineBelow: 8 * 1024, // inline assets whose size is below this many bytes
  };

  const wpc = { isProd, argv, mode, root, app, cfg, web, lib, build, options };

  // bring in the parts of the build pipeline
  const Esm = require('./esm')(wpc);

  const Base = require('./setup')(wpc);
  const Lint = require('./eslint')(wpc);
  const Babel = require('./babel')(wpc);
  const Assets = require('./assets')(wpc);
  const Styles = require('./styles')(wpc);

  // NOTE: webpack configuration is code as well, so include Lint early on.
  // Also for now we want source map for both production and development!
  // TODO: remove source-map when going live
  let merged = merge(Esm, Base, Lint, Babel, Assets, Styles, {
    devtool: 'source-map',
  });

  if (isProd) {
    // production
    const Optimize = require('./optimize')(wpc);
    merged = merge(merged, Optimize);
  } else {
    // development
    const Development = require('./development')({
      ...wpc,
      host: process.env.HOST || 'localhost',
      port: process.env.PORT || 3000,
    });

    merged = merge(merged, Development);
  }

  return merged;
};
