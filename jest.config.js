/** @type {import('jest').Config} */
module.exports = {
  // =============================================================================
  // ENTERPRISE JEST CONFIGURATION
  // Superior Testing Setup for Browser AI Agent
  // =============================================================================

  // Test environment
  testEnvironment: 'node',
  
  // Root directories
  roots: ['<rootDir>/apps', '<rootDir>/packages'],
  
  // Module paths
  modulePaths: ['<rootDir>'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Module name mapping for path aliases
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@api/(.*)$': '<rootDir>/apps/api/src/$1',
    '^@agents/(.*)$': '<rootDir>/apps/agents/src/$1',
    '^@website/(.*)$': '<rootDir>/apps/website/src/$1',
    '^@shared/(.*)$': '<rootDir>/packages/shared/src/$1',
    '^@browser-ai-agent/shared$': '<rootDir>/packages/shared/src',
    '^@browser-ai-agent/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
  },
  
  // File extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform files
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        target: 'ES2022',
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
      },
    }],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.(ts|tsx|js|jsx)',
    '**/*.(test|spec).(ts|tsx|js|jsx)',
  ],
  
  // Files to ignore
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
    '<rootDir>/.next/',
    '<rootDir>/coverage/',
  ],
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@fastify|fastify))',
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
  ],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'apps/**/*.{ts,tsx}',
    'packages/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/*.config.{ts,js}',
    '!**/*.test.{ts,tsx}',
    '!**/*.spec.{ts,tsx}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
    'json-summary',
  ],
  
  // Coverage thresholds (Enterprise standards)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './apps/api/src/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './apps/agents/src/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './packages/shared/src/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
  
  // Global setup and teardown
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',
  
  // Projects for multi-package testing
  projects: [
    {
      displayName: 'API',
      testMatch: ['<rootDir>/apps/api/**/*.(test|spec).(ts|tsx)'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/apps/api/jest.setup.js'],
    },
    {
      displayName: 'Agents',
      testMatch: ['<rootDir>/apps/agents/**/*.(test|spec).(ts|tsx)'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/apps/agents/jest.setup.js'],
    },
    {
      displayName: 'Website',
      testMatch: ['<rootDir>/apps/website/**/*.(test|spec).(ts|tsx)'],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/apps/website/jest.setup.js'],
    },
    {
      displayName: 'Shared',
      testMatch: ['<rootDir>/packages/shared/**/*.(test|spec).(ts|tsx)'],
      testEnvironment: 'node',
    },
  ],
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/coverage',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
    [
      'jest-html-reporters',
      {
        publicPath: '<rootDir>/coverage/html-report',
        filename: 'report.html',
        expand: true,
      },
    ],
  ],
  
  // Notify on test results
  notify: true,
  notifyMode: 'failure-change',
  
  // Bail on first test failure in CI
  bail: process.env.CI ? 1 : 0,
  
  // Force exit after tests complete
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Max workers for parallel execution
  maxWorkers: process.env.CI ? 2 : '50%',
  
  // Cache directory
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
};