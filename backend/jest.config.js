/** Jest config: unit specs live beside sources, integration specs in test/. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true, diagnostics: false }],
  },
  testTimeout: 60000,
  maxWorkers: 1,
  forceExit: true,
  verbose: true,
};
