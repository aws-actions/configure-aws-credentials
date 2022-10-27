/** @type {import('jest').Config} */
const config = {
  verbose: true,
  transform: {
    '^.+\\.m?[tj]sx?$': ['ts-jest'],
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.ts?(x)',
    '<rootDir>/(test|src)/**/*(*.)@(spec|test).ts?(x)',
    '<rootDir>/test/**/*.(test|spec).(js|jsx|ts|tsx)',
  ],
  clearMocks: true,
  collectCoverage: true,
  coverageReporters: ['json', 'lcov', 'clover', 'cobertura', 'text'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testPathIgnorePatterns: ['/node_modules/'],
  watchPathIgnorePatterns: ['/node_modules/'],
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-reports',
      },
    ],
  ],
  preset: 'ts-jest/presets/default-legacy',
};

module.exports = config;
