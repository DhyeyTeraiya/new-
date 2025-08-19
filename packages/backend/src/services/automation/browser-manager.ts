import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { 
  BrowserInstance, 
  BrowserContext as CustomBrowserContext,
  BrowserPage,
  Cookie 
} from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface BrowserManagerConfig {
  defaultBrowser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  maxInstances: number;
  instanceTimeout: number;
  defaultViewport: { width: number; height: number };
  userAgent?: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

export class BrowserManager {
  private readonly logger: Logger;
  private readonly config: BrowserManagerConfig;
  private readonly instances: Map<string, BrowserInstance>;
  private readonly browsers: Map<string, Browser>;

  constructor(config: BrowserManagerConfig) {
    this.logger = createLogger('BrowserManager');
    this.config = config;
    this.instances = new Map();
    this.browsers = new Map();

    this.logger.info('Browser Manager initialized', {
      defaultBrowser: config.defaultBrowser,
      headless: config.headless,
      maxInstances: config.maxInstances,
    });
  }

  /**
   * Create a new browser instance
   */
  async createInstance(
    sessionId: string,
    options?: {
      browser?: 'chromium' | 'firefox' | 'webkit';
      headless?: boolean;
      viewport?: { width: number; height: number };
      userAgent?: string;
    }
  ): Promise<BrowserInstance> {
    const startTime = Date.now();

    try {
      // Check instance limit
      if (this.instances.size >= this.config.maxInstances) {
        await this.cleanupOldInstances();
        
        if (this.instances.size >= this.config.maxInstances) {
          throw new Error('Maximum browser instances limit reached');
        }
      }

      const browserType = options?.browser || this.config.defaultBrowser;
      const headless = options?.headless ?? this.config.headless;
      const viewport = options?.viewport || this.config.defaultViewport;

      this.logger.debug('Creating browser instance', {
        sessionId,
        browserType,
        headless,
        viewport,
      });

      // Get or create browser
      const browser = await this.getBrowser(browserType, headless);

      // Create browser context
      const context = await browser.newContext({
        viewport,
        userAgent: options?.userAgent || this.config.userAgent,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true,
        acceptDownloads: true,
        proxy: this.config.proxy,
      });

      // Create initial page
      const page = await context.newPage();

      // Set up page event listeners
      this.setupPageListeners(page, sessionId);

      const instanceId = uuidv4();
      const instance: BrowserInstance = {
        id: instanceId,
        type: browserType,
        headless,
        context: await this.serializeContext(context),
        page: await this.serializePage(page),
        status: 'ready',
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      // Store references
      this.instances.set(instanceId, instance);
      
      // Store Playwright objects for internal use
      (instance as any)._playwrightContext = context;
      (instance as any)._playwrightPage = page;

      const creationTime = Date.now() - startTime;
      this.logger.info('Browser instance created', {
        instanceId,
        sessionId,
        browserType,
        creationTime,
      });

      return instance;
    } catch (error) {
      this.logger.error('Failed to create browser instance', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get browser instance by ID
   */
  getInstance(instanceId: string): BrowserInstance | null {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Get page from instance
   */
  getPage(instanceId: string): Page | null {
    const instance = this.instances.get(instanceId);
    return instance ? (instance as any)._playwrightPage : null;
  }

  /**
   * Get context from instance
   */
  getContext(instanceId: string): BrowserContext | null {
    const instance = this.instances.get(instanceId);
    return instance ? (instance as any)._playwrightContext : null;
  }

  /**
   * Update instance activity
   */
  updateActivity(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.lastActivity = new Date();
    }
  }

  /**
   * Set instance status
   */
  setStatus(instanceId: string, status: BrowserInstance['status']): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = status;
      this.updateActivity(instanceId);
    }
  }

  /**
   * Close browser instance
   */
  async closeInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      this.logger.warn('Instance not found for closing', { instanceId });
      return;
    }

    try {
      const context = (instance as any)._playwrightContext as BrowserContext;
      if (context) {
        await context.close();
      }

      this.instances.delete(instanceId);
      
      this.logger.info('Browser instance closed', { instanceId });
    } catch (error) {
      this.logger.error('Failed to close browser instance', {
        instanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get all instances
   */
  getAllInstances(): BrowserInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Clean up old or inactive instances
   */
  async cleanupOldInstances(): Promise<number> {
    const now = Date.now();
    const instancesToClose: string[] = [];

    for (const [instanceId, instance] of this.instances.entries()) {
      const age = now - instance.lastActivity.getTime();
      
      if (age > this.config.instanceTimeout || instance.status === 'error') {
        instancesToClose.push(instanceId);
      }
    }

    for (const instanceId of instancesToClose) {
      await this.closeInstance(instanceId);
    }

    if (instancesToClose.length > 0) {
      this.logger.info('Cleaned up old instances', { 
        count: instancesToClose.length 
      });
    }

    return instancesToClose.length;
  }

  /**
   * Close all instances and browsers
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down browser manager');

    // Close all instances
    const instanceIds = Array.from(this.instances.keys());
    await Promise.all(instanceIds.map(id => this.closeInstance(id)));

    // Close all browsers
    const browsers = Array.from(this.browsers.values());
    await Promise.all(browsers.map(browser => browser.close()));

    this.browsers.clear();
    this.instances.clear();

    this.logger.info('Browser manager shutdown complete');
  }

  /**
   * Get browser statistics
   */
  getStats(): {
    totalInstances: number;
    activeInstances: number;
    browserTypes: Record<string, number>;
    oldestInstance: Date | null;
  } {
    const instances = Array.from(this.instances.values());
    const browserTypes: Record<string, number> = {};

    instances.forEach(instance => {
      browserTypes[instance.type] = (browserTypes[instance.type] || 0) + 1;
    });

    return {
      totalInstances: instances.length,
      activeInstances: instances.filter(i => i.status === 'ready' || i.status === 'busy').length,
      browserTypes,
      oldestInstance: instances.length > 0 
        ? new Date(Math.min(...instances.map(i => i.createdAt.getTime())))
        : null,
    };
  }

  /**
   * Private helper methods
   */
  private async getBrowser(
    type: 'chromium' | 'firefox' | 'webkit',
    headless: boolean
  ): Promise<Browser> {
    const browserKey = `${type}-${headless}`;
    
    if (this.browsers.has(browserKey)) {
      const browser = this.browsers.get(browserKey)!;
      if (browser.isConnected()) {
        return browser;
      } else {
        this.browsers.delete(browserKey);
      }
    }

    let browser: Browser;
    const launchOptions = {
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    };

    switch (type) {
      case 'chromium':
        browser = await chromium.launch(launchOptions);
        break;
      case 'firefox':
        browser = await firefox.launch(launchOptions);
        break;
      case 'webkit':
        browser = await webkit.launch(launchOptions);
        break;
      default:
        throw new Error(`Unsupported browser type: ${type}`);
    }

    this.browsers.set(browserKey, browser);
    
    this.logger.debug('Browser launched', { type, headless });
    
    return browser;
  }

  private setupPageListeners(page: Page, sessionId: string): void {
    page.on('console', (msg) => {
      this.logger.debug('Browser console', {
        sessionId,
        type: msg.type(),
        text: msg.text(),
      });
    });

    page.on('pageerror', (error) => {
      this.logger.warn('Browser page error', {
        sessionId,
        error: error.message,
      });
    });

    page.on('requestfailed', (request) => {
      this.logger.debug('Browser request failed', {
        sessionId,
        url: request.url(),
        failure: request.failure()?.errorText,
      });
    });

    page.on('load', () => {
      this.logger.debug('Page loaded', {
        sessionId,
        url: page.url(),
      });
    });
  }

  private async serializeContext(context: BrowserContext): Promise<CustomBrowserContext> {
    const cookies = await context.cookies();
    
    return {
      id: uuidv4(),
      userAgent: await context.evaluate(() => navigator.userAgent),
      viewport: context.viewportSize() || this.config.defaultViewport,
      javaScriptEnabled: true,
      cookies: cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires ? new Date(cookie.expires * 1000) : undefined,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite as Cookie['sameSite'],
      })),
      localStorage: {},
      sessionStorage: {},
    };
  }

  private async serializePage(page: Page): Promise<BrowserPage> {
    return {
      id: uuidv4(),
      url: page.url(),
      title: await page.title().catch(() => ''),
      loadState: 'load',
      metrics: {
        loadTime: 0,
        domContentLoadedTime: 0,
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        pageSize: 0,
        requestCount: 0,
      },
    };
  }
}