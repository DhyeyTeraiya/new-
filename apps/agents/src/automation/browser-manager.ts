import { chromium, firefox, webkit, Browser, BrowserContext, Page, LaunchOptions } from 'playwright';
import { logger } from '@/utils/logger';

// =============================================================================
// NEXT-GENERATION BROWSER MANAGER (Superior to Manus Browser Control)
// Master Plan: Advanced Playwright cluster with distributed management
// =============================================================================

export interface BrowserConfig {
  type: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  locale?: string;
  timezone?: string;
  geolocation?: {
    latitude: number;
    longitude: number;
  };
  permissions?: string[];
  stealth?: boolean;
  fingerprint?: BrowserFingerprint;
}

export interface BrowserFingerprint {
  userAgent: string;
  platform: string;
  languages: string[];
  screen: {
    width: number;
    height: number;
    colorDepth: number;
  };
  timezone: string;
  webgl: {
    vendor: string;
    renderer: string;
  };
  canvas: string;
  fonts: string[];
}

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  pages: Map<string, Page>;
  config: BrowserConfig;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface BrowserPool {
  sessions: Map<string, BrowserSession>;
  maxSessions: number;
  currentSessions: number;
  rotationInterval: number;
}

// =============================================================================
// ADVANCED BROWSER MANAGER IMPLEMENTATION
// =============================================================================

export class BrowserManager {
  private static instance: BrowserManager;
  private browserPool: BrowserPool;
  private rotationTimer?: NodeJS.Timeout;
  private proxyRotator: ProxyRotator;
  private fingerprintGenerator: FingerprintGenerator;

  private constructor() {
    this.browserPool = {
      sessions: new Map(),
      maxSessions: 10, // Configurable based on resources
      currentSessions: 0,
      rotationInterval: 300000, // 5 minutes
    };
    
    this.proxyRotator = new ProxyRotator();
    this.fingerprintGenerator = new FingerprintGenerator();
    
    this.startSessionRotation();
    logger.info('Browser Manager initialized');
  }

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  // =============================================================================
  // SESSION MANAGEMENT
  // =============================================================================

  async createSession(config: BrowserConfig): Promise<string> {
    logger.info('Creating new browser session', { config });

    // Check session limits
    if (this.browserPool.currentSessions >= this.browserPool.maxSessions) {
      await this.cleanupOldestSession();
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Apply stealth and fingerprinting
      const enhancedConfig = await this.enhanceConfig(config);
      
      // Launch browser with advanced options
      const browser = await this.launchBrowser(enhancedConfig);
      
      // Create context with stealth settings
      const context = await this.createStealthContext(browser, enhancedConfig);
      
      const session: BrowserSession = {
        id: sessionId,
        browser,
        context,
        pages: new Map(),
        config: enhancedConfig,
        createdAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      this.browserPool.sessions.set(sessionId, session);
      this.browserPool.currentSessions++;

      logger.info('Browser session created successfully', {
        sessionId,
        browserType: config.type,
        headless: config.headless,
      });

      return sessionId;
    } catch (error) {
      logger.error('Failed to create browser session', {
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<BrowserSession | null> {
    const session = this.browserPool.sessions.get(sessionId);
    
    if (session && session.isActive) {
      session.lastActivity = new Date();
      return session;
    }
    
    return null;
  }

  async createPage(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found or inactive`);
    }

    const pageId = `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const page = await session.context.newPage();
      
      // Apply page-level stealth and monitoring
      await this.setupPageStealth(page, session.config);
      await this.setupPageMonitoring(page, pageId);
      
      session.pages.set(pageId, page);
      session.lastActivity = new Date();

      logger.info('New page created', {
        sessionId,
        pageId,
        totalPages: session.pages.size,
      });

      return pageId;
    } catch (error) {
      logger.error('Failed to create page', {
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  async getPage(sessionId: string, pageId: string): Promise<Page | null> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return null;
    }

    const page = session.pages.get(pageId);
    
    if (page && !page.isClosed()) {
      session.lastActivity = new Date();
      return page;
    }
    
    return null;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.browserPool.sessions.get(sessionId);
    
    if (!session) {
      return;
    }

    try {
      // Close all pages
      for (const [pageId, page] of session.pages) {
        if (!page.isClosed()) {
          await page.close();
        }
      }

      // Close context and browser
      await session.context.close();
      await session.browser.close();

      session.isActive = false;
      this.browserPool.sessions.delete(sessionId);
      this.browserPool.currentSessions--;

      logger.info('Browser session closed', {
        sessionId,
        pagesCount: session.pages.size,
      });
    } catch (error) {
      logger.error('Error closing browser session', {
        sessionId,
        error: error.message,
      });
    }
  }

  // =============================================================================
  // ADVANCED BROWSER LAUNCHING
  // =============================================================================

  private async launchBrowser(config: BrowserConfig): Promise<Browser> {
    const launchOptions: LaunchOptions = {
      headless: config.headless,
      proxy: config.proxy,
      args: this.getBrowserArgs(config),
    };

    // Add stealth arguments
    if (config.stealth) {
      launchOptions.args = [
        ...launchOptions.args || [],
        ...this.getStealthArgs(),
      ];
    }

    switch (config.type) {
      case 'chromium':
        return await chromium.launch(launchOptions);
      case 'firefox':
        return await firefox.launch(launchOptions);
      case 'webkit':
        return await webkit.launch(launchOptions);
      default:
        throw new Error(`Unsupported browser type: ${config.type}`);
    }
  }

  private getBrowserArgs(config: BrowserConfig): string[] {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ];

    // Add viewport if specified
    if (config.viewport) {
      args.push(`--window-size=${config.viewport.width},${config.viewport.height}`);
    }

    return args;
  }

  private getStealthArgs(): string[] {
    return [
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-extensions-except=/path/to/extension',
      '--disable-plugins-discovery',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
    ];
  }

  // =============================================================================
  // STEALTH CONTEXT CREATION
  // =============================================================================

  private async createStealthContext(browser: Browser, config: BrowserConfig): Promise<BrowserContext> {
    const contextOptions: any = {
      viewport: config.viewport || { width: 1920, height: 1080 },
      userAgent: config.userAgent || config.fingerprint?.userAgent,
      locale: config.locale || 'en-US',
      timezoneId: config.timezone || 'America/New_York',
      geolocation: config.geolocation,
      permissions: config.permissions || [],
    };

    const context = await browser.newContext(contextOptions);

    // Apply stealth scripts
    if (config.stealth) {
      await this.applyStealthScripts(context, config.fingerprint);
    }

    return context;
  }

  private async applyStealthScripts(context: BrowserContext, fingerprint?: BrowserFingerprint): Promise<void> {
    // Override navigator properties
    await context.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Override chrome runtime
      if (!window.chrome) {
        window.chrome = {};
      }
      if (!window.chrome.runtime) {
        window.chrome.runtime = {};
      }
    });

    // Apply fingerprint if provided
    if (fingerprint) {
      await this.applyFingerprint(context, fingerprint);
    }
  }

  private async applyFingerprint(context: BrowserContext, fingerprint: BrowserFingerprint): Promise<void> {
    await context.addInitScript((fp) => {
      // Override screen properties
      Object.defineProperties(screen, {
        width: { get: () => fp.screen.width },
        height: { get: () => fp.screen.height },
        colorDepth: { get: () => fp.screen.colorDepth },
      });

      // Override timezone
      const originalDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function(...args) {
        if (args.length === 0) {
          args = [fp.timezone];
        }
        return new originalDateTimeFormat(...args);
      };

      // Override WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return fp.webgl.vendor;
        }
        if (parameter === 37446) {
          return fp.webgl.renderer;
        }
        return getParameter.call(this, parameter);
      };
    }, fingerprint);
  }

  // =============================================================================
  // PAGE STEALTH AND MONITORING
  // =============================================================================

  private async setupPageStealth(page: Page, config: BrowserConfig): Promise<void> {
    // Block unnecessary resources for faster loading
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Add human-like mouse movements
    await page.addInitScript(() => {
      let mouseX = 0;
      let mouseY = 0;
      
      document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
      });

      // Override mouse events to add slight randomness
      const originalClick = HTMLElement.prototype.click;
      HTMLElement.prototype.click = function() {
        // Add small random delay
        setTimeout(() => {
          originalClick.call(this);
        }, Math.random() * 100 + 50);
      };
    });

    // Set up request interception for stealth
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
    });
  }

  private async setupPageMonitoring(page: Page, pageId: string): Promise<void> {
    // Monitor console messages
    page.on('console', (msg) => {
      logger.debug('Page console', {
        pageId,
        type: msg.type(),
        text: msg.text(),
      });
    });

    // Monitor network requests
    page.on('request', (request) => {
      logger.debug('Page request', {
        pageId,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      });
    });

    // Monitor page errors
    page.on('pageerror', (error) => {
      logger.error('Page error', {
        pageId,
        error: error.message,
      });
    });

    // Monitor crashes
    page.on('crash', () => {
      logger.error('Page crashed', { pageId });
    });
  }

  // =============================================================================
  // CONFIGURATION ENHANCEMENT
  // =============================================================================

  private async enhanceConfig(config: BrowserConfig): Promise<BrowserConfig> {
    const enhanced = { ...config };

    // Generate fingerprint if stealth is enabled
    if (config.stealth && !config.fingerprint) {
      enhanced.fingerprint = await this.fingerprintGenerator.generate();
    }

    // Rotate proxy if needed
    if (!config.proxy && config.stealth) {
      enhanced.proxy = await this.proxyRotator.getNext();
    }

    // Set realistic user agent if not provided
    if (!config.userAgent) {
      enhanced.userAgent = this.generateRealisticUserAgent(config.type);
    }

    return enhanced;
  }

  private generateRealisticUserAgent(browserType: string): string {
    const userAgents = {
      chromium: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ],
      firefox: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      ],
      webkit: [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      ],
    };

    const agents = userAgents[browserType] || userAgents.chromium;
    return agents[Math.floor(Math.random() * agents.length)];
  }

  // =============================================================================
  // SESSION ROTATION AND CLEANUP
  // =============================================================================

  private startSessionRotation(): void {
    this.rotationTimer = setInterval(() => {
      this.rotateOldSessions();
    }, this.browserPool.rotationInterval);
  }

  private async rotateOldSessions(): Promise<void> {
    const now = new Date();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.browserPool.sessions) {
      const age = now.getTime() - session.lastActivity.getTime();
      
      if (age > maxAge) {
        logger.info('Rotating old session', {
          sessionId,
          age: Math.floor(age / 1000),
        });
        
        await this.closeSession(sessionId);
      }
    }
  }

  private async cleanupOldestSession(): Promise<void> {
    let oldestSession: BrowserSession | null = null;
    let oldestTime = Date.now();

    for (const session of this.browserPool.sessions.values()) {
      if (session.lastActivity.getTime() < oldestTime) {
        oldestTime = session.lastActivity.getTime();
        oldestSession = session;
      }
    }

    if (oldestSession) {
      await this.closeSession(oldestSession.id);
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  getStats(): any {
    return {
      totalSessions: this.browserPool.sessions.size,
      activeSessions: Array.from(this.browserPool.sessions.values()).filter(s => s.isActive).length,
      maxSessions: this.browserPool.maxSessions,
      totalPages: Array.from(this.browserPool.sessions.values()).reduce((sum, session) => sum + session.pages.size, 0),
    };
  }

  async shutdown(): Promise<void> {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    // Close all sessions
    const sessionIds = Array.from(this.browserPool.sessions.keys());
    await Promise.all(sessionIds.map(id => this.closeSession(id)));

    logger.info('Browser Manager shutdown complete');
  }
}

// =============================================================================
// HELPER CLASSES
// =============================================================================

class ProxyRotator {
  private proxies: Array<{ server: string; username?: string; password?: string; health: 'healthy' | 'degraded' | 'failed'; lastCheck: Date; responseTime: number }> = [];
  private currentIndex = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize with proxy list (would be loaded from config)
    this.proxies = [
      // Premium proxy providers for production use
      { server: 'proxy1.example.com:8080', username: 'user1', password: 'pass1', health: 'healthy', lastCheck: new Date(), responseTime: 0 },
      { server: 'proxy2.example.com:8080', username: 'user2', password: 'pass2', health: 'healthy', lastCheck: new Date(), responseTime: 0 },
      { server: 'proxy3.example.com:8080', username: 'user3', password: 'pass3', health: 'healthy', lastCheck: new Date(), responseTime: 0 },
    ];
    
    this.startHealthChecks();
  }

  async getNext(): Promise<{ server: string; username?: string; password?: string } | undefined> {
    if (this.proxies.length === 0) {
      return undefined;
    }

    // Filter healthy proxies
    const healthyProxies = this.proxies.filter(p => p.health === 'healthy');
    
    if (healthyProxies.length === 0) {
      // Fallback to degraded proxies if no healthy ones
      const degradedProxies = this.proxies.filter(p => p.health === 'degraded');
      if (degradedProxies.length === 0) {
        return undefined;
      }
      
      const proxy = degradedProxies[this.currentIndex % degradedProxies.length];
      this.currentIndex = (this.currentIndex + 1) % degradedProxies.length;
      return { server: proxy.server, username: proxy.username, password: proxy.password };
    }

    // Use healthy proxy with best response time
    healthyProxies.sort((a, b) => a.responseTime - b.responseTime);
    const proxy = healthyProxies[0];
    
    return { server: proxy.server, username: proxy.username, password: proxy.password };
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkProxyHealth();
    }, 60000); // Check every minute
  }

  private async checkProxyHealth(): Promise<void> {
    for (const proxy of this.proxies) {
      try {
        const startTime = Date.now();
        
        // Simple health check - would implement actual proxy testing
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
        proxy.responseTime = Date.now() - startTime;
        proxy.health = proxy.responseTime < 1000 ? 'healthy' : 'degraded';
        proxy.lastCheck = new Date();
        
      } catch (error) {
        proxy.health = 'failed';
        proxy.lastCheck = new Date();
        proxy.responseTime = 9999;
      }
    }
  }

  getStats(): any {
    return {
      totalProxies: this.proxies.length,
      healthyProxies: this.proxies.filter(p => p.health === 'healthy').length,
      degradedProxies: this.proxies.filter(p => p.health === 'degraded').length,
      failedProxies: this.proxies.filter(p => p.health === 'failed').length,
      averageResponseTime: this.proxies.reduce((sum, p) => sum + p.responseTime, 0) / this.proxies.length,
    };
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

class FingerprintGenerator {
  private fingerprintTemplates: BrowserFingerprint[] = [
    // Windows Chrome fingerprints
    {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Win32',
      languages: ['en-US', 'en'],
      screen: { width: 1920, height: 1080, colorDepth: 24 },
      timezone: 'America/New_York',
      webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      canvas: this.generateCanvasFingerprint(),
      fonts: ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact'],
    },
    // macOS Safari fingerprints
    {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      platform: 'MacIntel',
      languages: ['en-US', 'en'],
      screen: { width: 2560, height: 1440, colorDepth: 24 },
      timezone: 'America/Los_Angeles',
      webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' },
      canvas: this.generateCanvasFingerprint(),
      fonts: ['Arial', 'Helvetica Neue', 'Times', 'Courier', 'Verdana', 'Georgia', 'Palatino', 'Times New Roman', 'Monaco', 'Menlo'],
    },
    // Linux Firefox fingerprints
    {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      platform: 'Linux x86_64',
      languages: ['en-US', 'en'],
      screen: { width: 1920, height: 1080, colorDepth: 24 },
      timezone: 'Europe/London',
      webgl: { vendor: 'Mesa', renderer: 'Mesa DRI Intel(R) UHD Graphics 620 (WHL GT2)' },
      canvas: this.generateCanvasFingerprint(),
      fonts: ['DejaVu Sans', 'Liberation Sans', 'Ubuntu', 'Droid Sans', 'Noto Sans', 'Arial', 'Helvetica', 'Times New Roman'],
    },
  ];

  async generate(): Promise<BrowserFingerprint> {
    // Select random template
    const template = this.fingerprintTemplates[Math.floor(Math.random() * this.fingerprintTemplates.length)];
    
    // Add randomization to make each fingerprint unique
    return {
      ...template,
      screen: {
        ...template.screen,
        width: template.screen.width + (Math.random() > 0.5 ? Math.floor(Math.random() * 100) : 0),
        height: template.screen.height + (Math.random() > 0.5 ? Math.floor(Math.random() * 100) : 0),
      },
      canvas: this.generateCanvasFingerprint(),
      fonts: this.shuffleArray([...template.fonts]),
    };
  }

  private generateCanvasFingerprint(): string {
    // Generate unique canvas fingerprint
    const variations = [
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHlkEver0AAAABJRU5ErkJggg==',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ];
    
    return variations[Math.floor(Math.random() * variations.length)];
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export default BrowserManager;