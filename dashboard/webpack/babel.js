const presets = [
  ['@babel/preset-env', {
    modules: false,       /* do not transpile ESM */
    bugfixes: true,       /* see https://babeljs.io/docs/en/babel-preset-env#bugfixes */
    useBuiltIns: 'usage', /* disable polyfills; target the latest and greatest! */
    debug: false,
    targets: {
      // esmodules: true,
      node: 'current',
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

module.exports = (wpc) => {
  const test = /\.jsx?$/;
  const exclude = /(node_modules|bower_components)/;

  if (wpc.isProd) {
    plugins.push([
      'transform-react-remove-prop-types',
      {
        mode: 'remove',
        removeImport: true,
        additionalLibraries: ['react', 'react-dom'],
      },
    ]);
  }

  const loaders = [
    {
      loader: 'babel-loader',
      options: { presets, plugins }
    },
  ];

  const module = {
    rules: [
      {
        test, exclude, use: loaders
      },
    ]
  };

  return { module };
};
