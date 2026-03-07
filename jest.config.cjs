/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 15000,
  maxWorkers: 1, // Run tests sequentially to avoid DB conflicts
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        target: 'es2022',
      },
    }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    // Redirect .js extension imports for generated prisma client to the .ts file
    '^(.*generated/prisma/client)\\.js$': '$1',
    // Allow .js extension imports for local TypeScript modules
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  verbose: true,
};
