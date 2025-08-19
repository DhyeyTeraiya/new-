import { logger } from '@/utils/logger';

// Simple in-memory cache for development
export class SimpleCacheService {
  private static instance: SimpleCacheService;
  private cache: Map<string, { value: string; expires?: number }> = new Map();

  private constructor() {}

  public static getInstance(): SimpleCacheService {
    if (!SimpleCacheService.instance) {
      SimpleCacheService.instance = new SimpleCacheService();
    }
    return SimpleCacheService.instance;
  }

  public async connect(): Promise<void> {
    logger.info('Simple cache connected (in-memory)');
  }

  public async disconnect(): Promise<void> {
    logger.info('Simple cache disconnected');
    this.cache.clear();
  }

  public async set(key: string, value: string, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + (ttl * 1000) : undefined;
    this.cache.set(key, { value, expires });
  }

  public async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  public async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  public async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }

  // Cleanup expired items periodically
  public startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
        if (item.expires && now > item.expires) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }
}

export default SimpleCacheService;