const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const cssLoader = (cssModule, localIdentName = undefined) => {
  return {
    loader: 'css-loader',
    options: {
      sourceMap: true,
      modules: {
        mode: cssModule,
        localIdentName
      },
      importLoaders: 1,
    }
  };
};

const sassLoader = (includePaths) => {
  return {
    loader: 'sass-loader',
    options: {
      sourceMap: true,
      sassOptions: {
        includePaths
      }
    }
  };
};

const cssExtractor = (_hmr) => {
  return {
    loader: MiniCssExtractPlugin.loader,
    options: {
      // if hmr doesn't work, uncomment next line to use force
      // reloadAll: _hmr ? true : false
    }
  };
};

// Keep each export to a single test
module.exports = (wpc) => {
  const test = /\.(css|scss)$/;
  const plugins = [];
  const localCss = [];
  const globalCss = [];
  const hmr = !wpc.isProd; // when true, we do not want to hash css file names

  // NOTE:
  // - chunks are from imported css files in java script
  // - and filenames are entries listed in 'entry' of webpack
  // - you will need to evaluate the tradeoffs in using a hash
  //   in the resulting file name fromr either of these sources
  // - not using a hash allows you to publish to a website without
  //   accumulating past released cruft but also puts the burden
  //   of cache busting on you.
  // - in our case being able to deploy and revert using git is
  //   important so we chose not to use hash.
  // - the hash may actually work against you when using service
  //   workers; thus it is only helpful for simple deployments
  // - a hash is a simple solution for cache busting; however
  //   versioning and cache management are for more complex and
  //   thus need more systems thinking than to accept the simple
  //   solution without understanding the requirements in detail.
  plugins.push(
    new MiniCssExtractPlugin({
      filename: hmr ? '[name].css' : '[name].[contenthash].css',
      chunkFilename: hmr ? '[id].css' : '[id].[contenthash].css',
    })
  );

  // last step in the pipeline is minification
  localCss.push(cssExtractor(hmr));
  globalCss.push(cssExtractor(hmr));

  localCss.push(cssLoader(true, '[local]-[hash:base64:5]'));
  globalCss.push(cssLoader('global'));

  if (!wpc.isProd) {
    localCss.push({
      loader: 'style-loader', options: { injectType: 'singletonStyleTag' }
    });
  }

  // NOTE: loaders are chained last-in-first-out
  localCss.push(sassLoader([wpc.components]));
  globalCss.push(sassLoader([wpc.app, wpc.lib]));

  return {
    module: {
      rules: [
        {
          test,
          include: [`${wpc.app}/components`],
          exclude: [/node_modules/, wpc.app, wpc.lib],
          use: localCss
        },
        {
          test,
          include: [wpc.app, wpc.lib],
          exclude: [/node_modules/, `${wpc.app}/components`],
          use: globalCss
        },
      ]
    },
    plugins
  };
};
