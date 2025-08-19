// =============================================================================
// ENTERPRISE JEST GLOBAL SETUP
// Initialize test environment for Browser AI Agent
// =============================================================================

const { MongoMemoryServer } = require('mongodb-memory-server');
const { createClient } = require('redis');

let mongod;
let redisClient;

module.exports = async () => {
  console.log('🔧 Setting up test environment...');
  
  try {
    // Start in-memory MongoDB instance
    mongod = await MongoMemoryServer.create({
      instance: {
        dbName: 'browser_ai_agent_test',
        port: 27018, // Use different port to avoid conflicts
      },
    });
    
    const mongoUri = mongod.getUri();
    process.env.MONGODB_URI = mongoUri;
    process.env.DATABASE_URL = mongoUri;
    
    console.log(`📦 MongoDB test instance started: ${mongoUri}`);
    
    // Start Redis test instance (if available)
    try {
      redisClient = createClient({
        url: 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
        },
      });
      
      await redisClient.connect();
      console.log('📦 Redis test instance connected');
      
      // Store client for cleanup
      global.__REDIS_CLIENT__ = redisClient;
    } catch (redisError) {
      console.warn('⚠️  Redis not available for tests, using mock instead');
      process.env.REDIS_DISABLED = 'true';
    }
    
    // Store MongoDB instance for cleanup
    global.__MONGOD__ = mongod;
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-testing-only';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
    process.env.RATE_LIMIT_DISABLED = 'true';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.PROMETHEUS_ENABLED = 'false';
    
    // Mock external API keys
    process.env.NVIDIA_API_KEY = 'test-nvidia-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    
    // Disable browser automation in tests
    process.env.BROWSER_HEADLESS = 'true';
    process.env.BROWSER_DISABLED = 'true';
    
    console.log('✅ Test environment setup completed');
    
  } catch (error) {
    console.error('❌ Failed to setup test environment:', error);
    throw error;
  }
};