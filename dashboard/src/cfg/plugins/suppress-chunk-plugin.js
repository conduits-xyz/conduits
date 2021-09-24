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
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(
      this.constructor.name,
      (compilation) => {
        // webpacks export `webpack-sources` to avoid cache problems
        const { sources, Compilation } = require('webpack');
        compilation.hooks.processAssets.tap(
					{
						name: this.constructor.name,
						stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
					},
					(assets) => {
            console.log('\nList of assets and their sizes:');
            // Object.entries(assets).forEach(([pathname, source]) => {
            //   console.log(`— ${pathname}: ${source.size()} bytes`);
            // });
            const process = (name, source, suppress=false) => {
              console.log(`— ${name}: ${source.size()} bytes, supress=${suppress}`);
              if (suppress) {
                console.log(`— deleting ${name} cos supress=${suppress}`);
                compilation.deleteAsset(name);
              }
            }

            Object.entries(assets).forEach(([pathname, source]) => {
              console.log('looking for ', pathname, ' in ', this.files);
              const { match } = this.files.find(f => pathname.includes(f.name)) ?? {match: undefined};
              if (match) {
                process(pathname, source, new RegExp(match).test(pathname));
              } else if (this.filter !== null) {
                console.log('global match', this.filter, pathname)
                process(pathname, source, new RegExp(this.filter).test(pathname));
              }
            });
          }
				);
      }
    );
  };
};

module.exports = SuppressChunk;