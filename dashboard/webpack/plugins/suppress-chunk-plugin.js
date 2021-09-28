// Replaces the use of https://github.com/alxlu/suppress-chunks-webpack-plugin
// Moving forward, we should start collecting plugins we use to be sourced
// locally, unless the plugin is directly supported by Webpack team.
//
// There were too many issues that required too much googling while upgrading
// from Webpack 4 to Webpack 5; much of these were around plugins becoming
// stale and not keeping up with Webpack upgrades.
//
// See https://github.com/alxlu/suppress-chunks-webpack-plugin/issues/24 to
// get the context for this decision.

// See https://github.com/alxlu/suppress-chunks-webpack-plugin for usage...
//
// TODO:
// - document if the usage differs from the original.
class SuppressChunk {
  constructor(files, { filter } = { filter: null }) {
    const fileList = Array.isArray(files) ? files : [files];
    this.filter = filter;
    this.files = fileList.map(file => {
      if (typeof file === 'string') {
        return { name: file, match: null };
      }
      return { match: null, ...file };
    });
  };

  get name() {
    return this.constructor.name;
  };

  get stage() {
    // webpacks export `webpack-sources` to avoid cache problems
    const { /* sources, */ Compilation } = require('webpack');
    return {
      name: this.name,
      stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
    };
  };

  processAsset(compilation, name, _source, suppress = false) {
    if (suppress) {
      // console.log(`\n— deleting ${name} coz supress=${suppress}`);
      compilation.deleteAsset(name);
    }
  };

  processAssets(compilation, assets) {
    Object.entries(assets).forEach(([pathname, source]) => {
      // first do a gross match followed by a finer check
      const { match } = this.files.find(f => pathname.includes(f.name))
        ?? { match: this.filter };
      if (match) {
        this.processAsset(
          compilation, pathname, source,
          new RegExp(match).test(pathname)
        );
      }
    });
  };

  apply(compiler) {
    compiler.hooks.compilation.tap(
      this.name,
      (compilation) => {
        compilation.hooks.processAssets.tap(
          this.stage,
          (assets) => this.processAssets(compilation, assets)
        );
      }
    );
  };
};

module.exports = SuppressChunk;
