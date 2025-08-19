// =============================================================================
// ENTERPRISE JEST SETUP
// Global test configuration for Browser AI Agent
// =============================================================================

// Extend Jest matchers
import 'jest-extended';

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/browser_ai_agent_test';
process.env.REDIS_MASTER_URL = 'redis://localhost:6379';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods in tests
global.console = {
  ...console,
  // Uncomment to suppress console.log in tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Generate test user data
  generateTestUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  
  // Generate test task data
  generateTestTask: () => ({
    id: 'test-task-id',
    userId: 'test-user-id',
    type: 'data_extraction',
    status: 'pending',
    command: 'Extract data from example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  
  // Generate test agent session data
  generateTestAgentSession: () => ({
    id: 'test-session-id',
    taskId: 'test-task-id',
    agentType: 'navigator',
    status: 'active',
    currentStep: 'navigating',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  
  // Wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create mock request object
  createMockRequest: (overrides = {}) => ({
    method: 'GET',
    url: '/test',
    headers: {},
    body: {},
    query: {},
    params: {},
    user: null,
    ...overrides,
  }),
  
  // Create mock response object
  createMockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };
    return res;
  },
};

// Global mocks
global.mocks = {
  // Mock Fastify instance
  fastify: {
    register: jest.fn(),
    listen: jest.fn(),
    close: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    addHook: jest.fn(),
    setErrorHandler: jest.fn(),
    setNotFoundHandler: jest.fn(),
  },
  
  // Mock MongoDB connection
  mongodb: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    collection: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  },
  
  // Mock Redis connection
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
  },
  
  // Mock Playwright browser
  playwright: {
    chromium: {
      launch: jest.fn(),
      connect: jest.fn(),
    },
    firefox: {
      launch: jest.fn(),
      connect: jest.fn(),
    },
    webkit: {
      launch: jest.fn(),
      connect: jest.fn(),
    },
  },
  
  // Mock AI services
  ai: {
    nvidia: {
      chat: jest.fn(),
      complete: jest.fn(),
    },
    openai: {
      chat: jest.fn(),
      complete: jest.fn(),
    },
    anthropic: {
      chat: jest.fn(),
      complete: jest.fn(),
    },
  },
};

// Setup and teardown hooks
beforeAll(async () => {
  // Global setup before all tests
  console.log('🚀 Starting test suite...');
});

afterAll(async () => {
  // Global cleanup after all tests
  console.log('✅ Test suite completed');
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  jest.restoreAllMocks();
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests
});

export {};