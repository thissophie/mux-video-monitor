module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // dist/ holds a copy of package.json after a build, which jest's haste map
  // reports as a duplicate of the real one.
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // @swc/jest rather than ts-jest: ts-jest 29 cannot use the TypeScript 7
  // compiler API this project pins. Matches frontend/jest.config.js.
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2020',
        },
      },
    ],
  },
};
