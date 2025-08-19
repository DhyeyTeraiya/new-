// =============================================================================
// ENTERPRISE JEST GLOBAL TEARDOWN
// Cleanup test environment for Browser AI Agent
// =============================================================================

module.exports = async () => {
  console.log('🧹 Cleaning up test environment...');
  
  try {
    // Cleanup Redis connection
    if (global.__REDIS_CLIENT__) {
      await global.__REDIS_CLIENT__.quit();
      console.log('📦 Redis test instance disconnected');
    }
    
    // Cleanup MongoDB instance
    if (global.__MONGOD__) {
      await global.__MONGOD__.stop();
      console.log('📦 MongoDB test instance stopped');
    }
    
    console.log('✅ Test environment cleanup completed');
    
  } catch (error) {
    console.error('❌ Failed to cleanup test environment:', error);
    // Don't throw error to avoid failing tests
  }
};