// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

export default {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // Make calling deprecated APIs throw helpful error messages
  errorOnDeprecated: true,

  // modulePaths: [
  //   '<rootDir>/src/app',
  //   '<rootDir>/src/store',
  //   '<rootDir>/src/api',
  // ],

  moduleNameMapper: {
    '^app(.*)$': '<rootDir>/src/app/$1',
    '^components(.*)$': '<rootDir>/src/app/components/$1',
    '^api(.*)$': '<rootDir>/src/api/$1',
    '^lib(.*)$': '<rootDir>/src/lib/$1',
    '^store(.*)$': '<rootDir>/src/store/$1',
    '^hooks(.*)$': '<rootDir>/src/hooks/$1',
    '^mocks(.*)$': '<rootDir>/src/mocks/$1',
  },

  displayName: 'conduits.app functional tests',

  // An array of file extensions your modules use
  moduleFileExtensions: [
    'js',
    'json',
    'jsx',
    'ts',
    'tsx',
    'node',
  ],

  // set the URL for the jsdom environment. It is reflected in properties
  // such as location.href; allows us to use relative paths
  // The test environment that will be used for testing
  testEnvironment: 'jest-environment-jsdom',
  testEnvironmentOptions: {
    url: 'http://not-a-tea-pot'
  },

  // fetch is not available in node, add it here
  setupFiles: ['<rootDir>/jest/setup.js'],

  // A list of paths to modules that run some code to configure or set up
  // the testing framework before each test
  setupFilesAfterEnv: ['<rootDir>/src/mocks/test-setup-after.js'],

  // The glob patterns Jest uses to detect test files
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/?(*.)+(spec|test).[tj]s?(x)',
  ],

  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.jsx?$': '<rootDir>/jest/transforms/babel.cjs',
    '^.+\\.s?css$': '<rootDir>/jest/transforms/css.cjs',
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '<rootDir>/jest/transforms/file.cjs'
  },

  // Indicates whether each individual test should be reported during the run
  verbose: true,
};
