module.exports = (wpc) => {
  // TODO:
  // - create rules for various asset types and enforce inline policy
  // - place the assets in their respective folders (branding, images, fonts,
  //   and icons)
  // - ensure inlined assets are not included in the 'preload' set....

  const test = /\.(woff|woff2|ttf|eot|svg)(\?[\s\S]+)?$/;

  // 'asset' will auto select resource or inline module type based on
  // file size (default 8kb)
  const module = {
    rules: [
      {
        test,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: wpc.options.inlineBelow
          }
        },
        generator: {
          // use [hash] instead of [name] for cache busting
          // frequently changing resources...
          filename: 'assets/fonts/[name][ext][query]'
        }
      },
    ]
  };

  return { module };
};
