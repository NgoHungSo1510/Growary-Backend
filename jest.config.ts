import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/__tests__/setup.ts', '/__tests__/testApp.ts'],
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
    verbose: true,
    forceExit: true,
    clearMocks: true,
};

export default config;
