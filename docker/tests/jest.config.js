module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['**/*.js', '!jest.config.js', '!coverage/**'],
  coverageDirectory: 'coverage',
  verbose: true
};
