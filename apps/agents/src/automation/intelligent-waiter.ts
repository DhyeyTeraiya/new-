import { Page } from 'playwright';
import { logger } from '@/utils/logger';

// =============================================================================
// INTELLIGENT WAITING MECHANISMS (Superior to Manus Wait Logic)
// Master Plan: ML-based content prediction and AJAX monitoring
// =============================================================================

export interface WaitCondition {
  type: 'element' | 'network' | 'content' | 'url' | 'custom';
  selector?: string;
  text?: string;
  url?: string;
  networkIdle?: boolean;
  customFunction?: () => Promise<boolean>;
  timeout?: number;
}

export interface WaitResult {
  success: boolean;
  condition: WaitCondition;
  duration: number;
  actualValue?: any;
  error?: string;
  predictions?: WaitPrediction[];
}

export interface WaitPrediction {
  type: string;
  confidence: number;
  estimatedTime: number;
  reasoning: string;
}

export interface PageState {
  url: string;
  title: string;
  loadState: string;
  networkRequests: number;
  domElements: number;
  lastActivity: Date;
  contentHash: string;
}

export interface ContentChangePattern {
  pattern: string;
  frequency: number;
  averageDelay: number;
  confidence: number;
  lastSeen: Date;
}

// =============================================================================
// INTELLIGENT WAITER IMPLEMENTATION
// =============================================================================

export class IntelligentWaiter {
  private pageStateHistory: Map<string, PageState[]> = new Map();
  private contentPatterns: Map<string, ContentChangePattern[]> = new Map();
  private networkMonitor: NetworkMonitor;
  private contentPredictor: ContentPredictor;

  constructor() {
    this.networkMonitor = new NetworkMonitor();
    this.contentPredictor = new ContentPredictor();
    logger.info('Intelligent Waiter initialized');
  }

  // =============================================================================
  // MAIN WAITING METHODS
  // =============================================================================

  async waitForCondition(page: Page, condition: WaitCondition): Promise<WaitResult> {
    const startTime = Date.now();
    const timeout = condition.timeout || 30000;
    const endTime = startTime + timeout;

    logger.info('Starting intelligent wait', {
      type: condition.type,
      timeout,
    });

    // Start monitoring
    await this.startMonitoring(page);

    // Generate predictions
    const predictions = await this.generatePredictions(page, condition);

    try {
      let result: any;

      switch (condition.type) {
        case 'element':
          result = await this.waitForElement(page, condition, endTime);
          break;
        case 'network':
          result = await this.waitForNetwork(page, condition, endTime);
          break;
        case 'content':
          result = await this.waitForContent(page, condition, endTime);
          break;
        case 'url':
          result = await this.waitForUrl(page, condition, endTime);
          break;
        case 'custom':
          result = await this.waitForCustom(page, condition, endTime);
          break;
        default:
          throw new Error(`Unknown wait condition type: ${condition.type}`);
      }

      const duration = Date.now() - startTime;

      // Update learning patterns
      await this.updatePatterns(page, condition, duration, true);

      logger.info('Wait condition satisfied', {
        type: condition.type,
        duration,
        predictions: predictions.length,
      });

      return {
        success: true,
        condition,
        duration,
        actualValue: result,
        predictions,
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // Update learning patterns for failures too
      await this.updatePatterns(page, condition, duration, false);

      logger.error('Wait condition failed', {
        type: condition.type,
        duration,
        error: error.message,
      });

      return {
        success: false,
        condition,
        duration,
        error: error.message,
        predictions,
      };
    } finally {
      await this.stopMonitoring(page);
    }
  }

  async waitForMultipleConditions(page: Page, conditions: WaitCondition[], mode: 'all' | 'any' = 'all'): Promise<WaitResult[]> {
    logger.info('Waiting for multiple conditions', {
      count: conditions.length,
      mode,
    });

    if (mode === 'any') {
      // Race conditions - return when first one completes
      const promises = conditions.map(condition => this.waitForCondition(page, condition));
      
      try {
        const result = await Promise.race(promises);
        return [result];
      } catch (error) {
        // If race fails, return all results
        const results = await Promise.allSettled(promises);
        return results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              success: false,
              condition: conditions[index],
              duration: 0,
              error: result.reason.message,
            };
          }
        });
      }
    } else {
      // Wait for all conditions
      const promises = conditions.map(condition => this.waitForCondition(page, condition));
      return await Promise.all(promises);
    }
  }

  // =============================================================================
  // SPECIFIC WAIT IMPLEMENTATIONS
  // =============================================================================

  private async waitForElement(page: Page, condition: WaitCondition, endTime: number): Promise<any> {
    if (!condition.selector) {
      throw new Error('Element selector is required for element wait');
    }

    while (Date.now() < endTime) {
      try {
        const element = await page.locator(condition.selector).first();
        
        if (await element.isVisible()) {
          return element;
        }
      } catch (error) {
        // Element not found yet, continue waiting
      }

      await this.intelligentDelay(page, condition);
    }

    throw new Error(`Element not found: ${condition.selector}`);
  }

  private async waitForNetwork(page: Page, condition: WaitCondition, endTime: number): Promise<any> {
    const networkState = this.networkMonitor.getState(page);
    
    if (condition.networkIdle) {
      // Wait for network to be idle
      while (Date.now() < endTime) {
        if (networkState.activeRequests === 0 && 
            Date.now() - networkState.lastRequestTime > 500) {
          return true;
        }
        
        await this.intelligentDelay(page, condition);
      }
    }

    throw new Error('Network condition not met');
  }

  private async waitForContent(page: Page, condition: WaitCondition, endTime: number): Promise<any> {
    if (!condition.text) {
      throw new Error('Text is required for content wait');
    }

    while (Date.now() < endTime) {
      const content = await page.textContent('body');
      
      if (content && content.includes(condition.text)) {
        return true;
      }

      await this.intelligentDelay(page, condition);
    }

    throw new Error(`Content not found: ${condition.text}`);
  }

  private async waitForUrl(page: Page, condition: WaitCondition, endTime: number): Promise<any> {
    if (!condition.url) {
      throw new Error('URL is required for URL wait');
    }

    while (Date.now() < endTime) {
      const currentUrl = page.url();
      
      if (currentUrl.includes(condition.url)) {
        return currentUrl;
      }

      await this.intelligentDelay(page, condition);
    }

    throw new Error(`URL condition not met: ${condition.url}`);
  }

  private async waitForCustom(page: Page, condition: WaitCondition, endTime: number): Promise<any> {
    if (!condition.customFunction) {
      throw new Error('Custom function is required for custom wait');
    }

    while (Date.now() < endTime) {
      try {
        const result = await condition.customFunction();
        
        if (result) {
          return result;
        }
      } catch (error) {
        // Custom function failed, continue waiting
      }

      await this.intelligentDelay(page, condition);
    }

    throw new Error('Custom condition not met');
  }

  // =============================================================================
  // INTELLIGENT DELAY AND PREDICTION
  // =============================================================================

  private async intelligentDelay(page: Page, condition: WaitCondition): Promise<void> {
    // Get predicted delay based on patterns
    const predictedDelay = await this.contentPredictor.predictDelay(page, condition);
    
    // Use adaptive delay based on page activity
    const pageActivity = await this.getPageActivity(page);
    
    let delay = 100; // Base delay
    
    if (predictedDelay > 0) {
      delay = Math.min(predictedDelay, 2000); // Cap at 2 seconds
    } else if (pageActivity.isActive) {
      delay = 200; // Shorter delay if page is active
    } else {
      delay = 500; // Longer delay if page is idle
    }

    await this.sleep(delay);
  }

  private async generatePredictions(page: Page, condition: WaitCondition): Promise<WaitPrediction[]> {
    const predictions: WaitPrediction[] = [];

    // Analyze page patterns
    const pageUrl = page.url();
    const patterns = this.contentPatterns.get(pageUrl) || [];

    // Generate predictions based on historical data
    for (const pattern of patterns) {
      if (this.isPatternRelevant(pattern, condition)) {
        predictions.push({
          type: 'historical',
          confidence: pattern.confidence,
          estimatedTime: pattern.averageDelay,
          reasoning: `Based on ${pattern.frequency} previous occurrences of similar pattern`,
        });
      }
    }

    // Generate predictions based on current page state
    const pageState = await this.getCurrentPageState(page);
    
    if (pageState.networkRequests > 0) {
      predictions.push({
        type: 'network-based',
        confidence: 0.7,
        estimatedTime: 2000,
        reasoning: 'Active network requests detected, content likely changing',
      });
    }

    // Generate predictions based on DOM changes
    const domChangeRate = await this.getDOMChangeRate(page);
    
    if (domChangeRate > 0) {
      predictions.push({
        type: 'dom-based',
        confidence: 0.6,
        estimatedTime: Math.max(1000, domChangeRate * 100),
        reasoning: 'DOM changes detected, waiting for stabilization',
      });
    }

    return predictions;
  }

  // =============================================================================
  // PAGE MONITORING AND ANALYSIS
  // =============================================================================

  private async startMonitoring(page: Page): Promise<void> {
    await this.networkMonitor.start(page);
    
    // Start DOM mutation observer
    await page.addInitScript(() => {
      window.__domChangeCount = 0;
      window.__lastDOMChange = Date.now();
      
      const observer = new MutationObserver((mutations) => {
        window.__domChangeCount += mutations.length;
        window.__lastDOMChange = Date.now();
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      
      window.__mutationObserver = observer;
    });
  }

  private async stopMonitoring(page: Page): Promise<void> {
    await this.networkMonitor.stop(page);
    
    // Stop DOM mutation observer
    await page.evaluate(() => {
      if (window.__mutationObserver) {
        window.__mutationObserver.disconnect();
      }
    });
  }

  private async getCurrentPageState(page: Page): Promise<PageState> {
    const url = page.url();
    const title = await page.title();
    const loadState = await page.evaluate(() => document.readyState);
    const networkRequests = this.networkMonitor.getActiveRequestCount(page);
    
    const domElements = await page.evaluate(() => {
      return document.querySelectorAll('*').length;
    });

    const contentHash = await page.evaluate(() => {
      const content = document.body.textContent || '';
      // Simple hash function
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString();
    });

    return {
      url,
      title,
      loadState,
      networkRequests,
      domElements,
      lastActivity: new Date(),
      contentHash,
    };
  }

  private async getPageActivity(page: Page): Promise<{ isActive: boolean; score: number }> {
    const networkActivity = this.networkMonitor.getActivityScore(page);
    
    const domActivity = await page.evaluate(() => {
      const now = Date.now();
      const lastChange = window.__lastDOMChange || 0;
      const changeCount = window.__domChangeCount || 0;
      
      // Activity score based on recent changes
      const timeSinceLastChange = now - lastChange;
      const recentActivity = timeSinceLastChange < 5000 ? changeCount / 10 : 0;
      
      return Math.min(recentActivity, 1);
    });

    const totalScore = (networkActivity + domActivity) / 2;
    
    return {
      isActive: totalScore > 0.3,
      score: totalScore,
    };
  }

  private async getDOMChangeRate(page: Page): Promise<number> {
    return await page.evaluate(() => {
      const changeCount = window.__domChangeCount || 0;
      const now = Date.now();
      const startTime = window.__monitoringStartTime || now;
      const duration = now - startTime;
      
      return duration > 0 ? (changeCount / duration) * 1000 : 0; // Changes per second
    });
  }

  // =============================================================================
  // PATTERN LEARNING AND UPDATES
  // =============================================================================

  private async updatePatterns(page: Page, condition: WaitCondition, duration: number, success: boolean): Promise<void> {
    const pageUrl = page.url();
    const patternKey = this.getPatternKey(condition);
    
    if (!this.contentPatterns.has(pageUrl)) {
      this.contentPatterns.set(pageUrl, []);
    }
    
    const patterns = this.contentPatterns.get(pageUrl)!;
    let existingPattern = patterns.find(p => p.pattern === patternKey);
    
    if (existingPattern) {
      // Update existing pattern
      existingPattern.frequency++;
      existingPattern.averageDelay = (existingPattern.averageDelay + duration) / 2;
      existingPattern.confidence = success ? 
        Math.min(existingPattern.confidence + 0.1, 1.0) :
        Math.max(existingPattern.confidence - 0.1, 0.1);
      existingPattern.lastSeen = new Date();
    } else {
      // Create new pattern
      patterns.push({
        pattern: patternKey,
        frequency: 1,
        averageDelay: duration,
        confidence: success ? 0.7 : 0.3,
        lastSeen: new Date(),
      });
    }

    // Limit pattern storage
    if (patterns.length > 100) {
      patterns.sort((a, b) => b.frequency - a.frequency);
      patterns.splice(50); // Keep top 50 patterns
    }
  }

  private getPatternKey(condition: WaitCondition): string {
    return `${condition.type}:${condition.selector || condition.text || condition.url || 'custom'}`;
  }

  private isPatternRelevant(pattern: ContentChangePattern, condition: WaitCondition): boolean {
    const conditionKey = this.getPatternKey(condition);
    return pattern.pattern === conditionKey || pattern.pattern.includes(condition.type);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): any {
    return {
      patternsCount: Array.from(this.contentPatterns.values()).reduce((sum, patterns) => sum + patterns.length, 0),
      pagesTracked: this.contentPatterns.size,
      networkMonitorStats: this.networkMonitor.getStats(),
    };
  }

  clearPatterns(): void {
    this.contentPatterns.clear();
    logger.info('Content patterns cleared');
  }
}

// =============================================================================
// HELPER CLASSES
// =============================================================================

class NetworkMonitor {
  private pageStates: Map<Page, { activeRequests: number; lastRequestTime: number; totalRequests: number }> = new Map();

  async start(page: Page): Promise<void> {
    const state = { activeRequests: 0, lastRequestTime: Date.now(), totalRequests: 0 };
    this.pageStates.set(page, state);

    page.on('request', () => {
      state.activeRequests++;
      state.totalRequests++;
      state.lastRequestTime = Date.now();
    });

    page.on('response', () => {
      state.activeRequests = Math.max(0, state.activeRequests - 1);
      state.lastRequestTime = Date.now();
    });

    page.on('requestfailed', () => {
      state.activeRequests = Math.max(0, state.activeRequests - 1);
      state.lastRequestTime = Date.now();
    });
  }

  async stop(page: Page): Promise<void> {
    this.pageStates.delete(page);
  }

  getState(page: Page): { activeRequests: number; lastRequestTime: number; totalRequests: number } {
    return this.pageStates.get(page) || { activeRequests: 0, lastRequestTime: 0, totalRequests: 0 };
  }

  getActiveRequestCount(page: Page): number {
    const state = this.pageStates.get(page);
    return state ? state.activeRequests : 0;
  }

  getActivityScore(page: Page): number {
    const state = this.pageStates.get(page);
    if (!state) return 0;

    const timeSinceLastRequest = Date.now() - state.lastRequestTime;
    const recentActivity = timeSinceLastRequest < 5000 ? state.activeRequests / 10 : 0;
    
    return Math.min(recentActivity, 1);
  }

  getStats(): any {
    return {
      activePagesCount: this.pageStates.size,
      totalActiveRequests: Array.from(this.pageStates.values()).reduce((sum, state) => sum + state.activeRequests, 0),
    };
  }
}

class ContentPredictor {
  async predictDelay(page: Page, condition: WaitCondition): Promise<number> {
    // Simple prediction based on condition type
    switch (condition.type) {
      case 'element':
        return 500; // Elements usually appear quickly
      case 'network':
        return 2000; // Network operations take longer
      case 'content':
        return 1000; // Content changes are medium speed
      case 'url':
        return 1500; // URL changes involve navigation
      default:
        return 1000; // Default prediction
    }
  }
}

export default IntelligentWaiter;