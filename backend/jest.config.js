module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: 'src/.*\\.test\\.ts$',
  setupFilesAfterEnv: ['./jest.setup.js']
};