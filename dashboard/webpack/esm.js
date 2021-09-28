// See https://github.com/webpack/webpack/issues/11467
// Fix is to revert to old behaviour of interpreting *.js as ESM

module.exports = (/* wpc */) => {
  const module = {
    rules: [
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      },
    ]
  };

  return { module };
};
