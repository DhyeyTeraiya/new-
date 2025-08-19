import { Request, Response, NextFunction } from 'express';
import { RateLimitInfo } from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';
import { AuthenticatedRequest } from './auth';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

export class RateLimitMiddleware {
  private readonly logger: Logger;
  private readonly store: Map<string, RateLimitEntry>;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.logger = createLogger('RateLimit');
    this.store = new Map();

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Create rate limiting middleware
   */
  create(config: RateLimitConfig) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const key = this.generateKey(req, config);
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Get or create rate limit entry
      let entry = this.store.get(key);
      
      if (!entry || entry.resetTime <= now) {
        // Create new entry or reset expired entry
        entry = {
          count: 0,
          resetTime: now + config.windowMs,
          firstRequest: now,
        };
        this.store.set(key, entry);
      }

      // Check if request should be counted
      const shouldCount = this.shouldCountRequest(req, res, config);
      
      if (shouldCount) {
        entry.count++;
      }

      // Check if limit exceeded
      if (entry.count > config.maxRequests) {
        this.logger.warn('Rate limit exceeded', {
          key,
          count: entry.count,
          limit: config.maxRequests,
          resetTime: new Date(entry.resetTime),
        });

        // Call custom handler if provided
        if (config.onLimitReached) {
          config.onLimitReached(req, res);
          return;
        }

        // Send rate limit error
        return this.sendRateLimitError(res, entry, config);
      }

      // Add rate limit headers
      this.addRateLimitHeaders(res, entry, config);

      this.logger.debug('Rate limit check passed', {
        key,
        count: entry.count,
        limit: config.maxRequests,
        remaining: config.maxRequests - entry.count,
      });

      next();
    };
  }

  /**
   * Create different rate limiters for different endpoints
   */
  createChatLimiter(): ReturnType<typeof this.create> {
    return this.create({
      windowMs: 60000, // 1 minute
      maxRequests: 30, // 30 requests per minute
      keyGenerator: (req) => this.getUserKey(req as AuthenticatedRequest),
    });
  }

  createAutomationLimiter(): ReturnType<typeof this.create> {
    return this.create({
      windowMs: 300000, // 5 minutes
      maxRequests: 10, // 10 automation requests per 5 minutes
      keyGenerator: (req) => this.getUserKey(req as AuthenticatedRequest),
    });
  }

  createScreenshotLimiter(): ReturnType<typeof this.create> {
    return this.create({
      windowMs: 60000, // 1 minute
      maxRequests: 20, // 20 screenshots per minute
      keyGenerator: (req) => this.getUserKey(req as AuthenticatedRequest),
    });
  }

  createGlobalLimiter(): ReturnType<typeof this.create> {
    return this.create({
      windowMs: 60000, // 1 minute
      maxRequests: 100, // 100 requests per minute per IP
      keyGenerator: (req) => this.getIpKey(req),
    });
  }

  /**
   * Get rate limit info for a key
   */
  getRateLimitInfo(key: string): RateLimitInfo | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    return {
      remaining: Math.max(0, entry.count),
      resetTime: new Date(entry.resetTime),
      limit: 0, // This would need to be passed from config
      windowSeconds: Math.floor((entry.resetTime - entry.firstRequest) / 1000),
    };
  }

  /**
   * Reset rate limit for a key
   */
  resetRateLimit(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Get current stats
   */
  getStats(): {
    totalKeys: number;
    activeKeys: number;
    oldestEntry: Date | null;
  } {
    const now = Date.now();
    let activeKeys = 0;
    let oldestTime = Infinity;

    for (const entry of this.store.values()) {
      if (entry.resetTime > now) {
        activeKeys++;
      }
      if (entry.firstRequest < oldestTime) {
        oldestTime = entry.firstRequest;
      }
    }

    return {
      totalKeys: this.store.size,
      activeKeys,
      oldestEntry: oldestTime === Infinity ? null : new Date(oldestTime),
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleaned up expired rate limit entries', { cleaned });
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }

  /**
   * Private helper methods
   */
  private generateKey(req: Request, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    // Default to IP-based key
    return this.getIpKey(req);
  }

  private getUserKey(req: AuthenticatedRequest): string {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return this.getIpKey(req);
  }

  private getIpKey(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.connection.remoteAddress;
    return `ip:${ip}`;
  }

  private shouldCountRequest(
    req: Request,
    res: Response,
    config: RateLimitConfig
  ): boolean {
    // Always count by default
    if (!config.skipSuccessfulRequests && !config.skipFailedRequests) {
      return true;
    }

    // For now, always count since we don't know the response status yet
    // In a more sophisticated implementation, this could be handled in a response middleware
    return true;
  }

  private addRateLimitHeaders(
    res: Response,
    entry: RateLimitEntry,
    config: RateLimitConfig
  ): void {
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const resetTime = Math.ceil(entry.resetTime / 1000);

    res.set({
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toString(),
      'X-RateLimit-Window': Math.ceil(config.windowMs / 1000).toString(),
    });
  }

  private sendRateLimitError(
    res: Response,
    entry: RateLimitEntry,
    config: RateLimitConfig
  ): void {
    const resetTime = Math.ceil(entry.resetTime / 1000);
    const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);

    res.set({
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': resetTime.toString(),
      'Retry-After': retryAfter.toString(),
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Try again in ${retryAfter} seconds.`,
        retryable: true,
        details: {
          limit: config.maxRequests,
          windowMs: config.windowMs,
          retryAfter,
        },
      },
      timestamp: new Date(),
    });
  }
}

// Global rate limiter instance
export const rateLimiter = new RateLimitMiddleware();