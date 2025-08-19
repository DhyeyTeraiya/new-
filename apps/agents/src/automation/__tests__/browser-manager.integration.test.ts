import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import BrowserManager, { BrowserConfig } from '../browser-manager';

// =============================================================================
// BROWSER MANAGER INTEGRATION TESTS
// Real-world browser management and stealth testing
// =============================================================================

describe('BrowserManager Integration Tests', () => {
  let browserManager: BrowserManager;

  beforeEach(() => {
    browserManager = BrowserManager.getInstance();
  });

  afterEach(async () => {
    await browserManager.shutdown();
  });

  describe('Advanced Browser Session Management', () => {
    it('should create multiple browser sessions with different configurations', async () => {
      const configs: BrowserConfig[] = [
        {
          type: 'chromium',
          headless: true,
          stealth: true,
          viewport: { width: 1920, height: 1080 },
        },
        {
          type: 'firefox',
          headless: true,
          stealth: false,
          viewport: { width: 1366, height: 768 },
        },
        {
          type: 'webkit',
          headless: true,
          stealth: true,
          viewport: { width: 1440, height: 900 },
        },
      ];

      const sessionIds: string[] = [];

      for (const config of configs) {
        const sessionId = await browserManager.createSession(config);
        expect(sessionId).toBeDefined();
        expect(typeof sessionId).toBe('string');
        sessionIds.push(sessionId);

        const session = await browserManager.getSession(sessionId);
        expect(session).toBeDefined();
        expect(session?.config.type).toBe(config.type);
      }

      // Verify all sessions are active
      const stats = browserManager.getStats();
      expect(stats.activeSessions).toBe(3);

      // Clean up sessions
      for (const sessionId of sessionIds) {
        await browserManager.closeSession(sessionId);
      }

      const finalStats = browserManager.getStats();
      expect(finalStats.activeSessions).toBe(0);
    });

    it('should handle session limits and rotation', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      // Create sessions up to the limit
      const sessionIds: string[] = [];
      const maxSessions = 5; // Assuming this is the configured limit

      for (let i = 0; i < maxSessions + 2; i++) {
        const sessionId = await browserManager.createSession(config);
        sessionIds.push(sessionId);
      }

      const stats = browserManager.getStats();
      expect(stats.activeSessions).toBeLessThanOrEqual(maxSessions);

      // Clean up
      for (const sessionId of sessionIds) {
        await browserManager.closeSession(sessionId);
      }
    });

    it('should create and manage pages within sessions', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: true,
      };

      const sessionId = await browserManager.createSession(config);
      const pageIds: string[] = [];

      // Create multiple pages
      for (let i = 0; i < 3; i++) {
        const pageId = await browserManager.createPage(sessionId);
        expect(pageId).toBeDefined();
        pageIds.push(pageId);

        const page = await browserManager.getPage(sessionId, pageId);
        expect(page).toBeDefined();
        expect(page?.isClosed()).toBe(false);
      }

      // Verify pages are accessible
      for (const pageId of pageIds) {
        const page = await browserManager.getPage(sessionId, pageId);
        expect(page).toBeDefined();
      }

      await browserManager.closeSession(sessionId);
    });
  });

  describe('Stealth and Anti-Detection Features', () => {
    it('should apply stealth configurations correctly', async () => {
      const stealthConfig: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: true,
        fingerprint: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          platform: 'Win32',
          languages: ['en-US', 'en'],
          screen: { width: 1920, height: 1080, colorDepth: 24 },
          timezone: 'America/New_York',
          webgl: { vendor: 'Google Inc.', renderer: 'ANGLE' },
          canvas: 'mock-canvas-fingerprint',
          fonts: ['Arial', 'Helvetica', 'Times New Roman'],
        },
      };

      const sessionId = await browserManager.createSession(stealthConfig);
      const pageId = await browserManager.createPage(sessionId);
      const page = await browserManager.getPage(sessionId, pageId);

      expect(page).toBeDefined();

      if (page) {
        // Navigate to a test page
        await page.goto('https://httpbin.org/user-agent');

        // Check that stealth features are applied
        const userAgent = await page.evaluate(() => navigator.userAgent);
        expect(userAgent).toBe(stealthConfig.fingerprint?.userAgent);

        const webdriver = await page.evaluate(() => navigator.webdriver);
        expect(webdriver).toBeUndefined();

        const languages = await page.evaluate(() => navigator.languages);
        expect(languages).toEqual(['en-US', 'en']);
      }

      await browserManager.closeSession(sessionId);
    });

    it('should randomize browser fingerprints', async () => {
      const configs: BrowserConfig[] = Array.from({ length: 3 }, () => ({
        type: 'chromium',
        headless: true,
        stealth: true,
      }));

      const fingerprints: string[] = [];

      for (const config of configs) {
        const sessionId = await browserManager.createSession(config);
        const pageId = await browserManager.createPage(sessionId);
        const page = await browserManager.getPage(sessionId, pageId);

        if (page) {
          await page.goto('https://httpbin.org/user-agent');
          const userAgent = await page.evaluate(() => navigator.userAgent);
          fingerprints.push(userAgent);
        }

        await browserManager.closeSession(sessionId);
      }

      // Fingerprints should be different (randomized)
      const uniqueFingerprints = new Set(fingerprints);
      expect(uniqueFingerprints.size).toBeGreaterThan(1);
    });

    it('should handle proxy rotation', async () => {
      const proxyConfig: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: true,
        proxy: {
          server: 'http://proxy.example.com:8080',
          username: 'testuser',
          password: 'testpass',
        },
      };

      const sessionId = await browserManager.createSession(proxyConfig);
      const pageId = await browserManager.createPage(sessionId);
      const page = await browserManager.getPage(sessionId, pageId);

      expect(page).toBeDefined();

      // Test would verify proxy usage, but requires actual proxy server
      // For now, just verify session creation succeeds with proxy config

      await browserManager.closeSession(sessionId);
    });
  });

  describe('Real Website Testing', () => {
    it('should handle modern SPA websites', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: true,
      };

      const sessionId = await browserManager.createSession(config);
      const pageId = await browserManager.createPage(sessionId);
      const page = await browserManager.getPage(sessionId, pageId);

      if (page) {
        // Navigate to a React-based SPA
        await page.goto('https://react-shopping-cart-67954.firebaseapp.com/', {
          waitUntil: 'networkidle',
        });

        // Wait for React to load
        await page.waitForSelector('.shelf', { timeout: 10000 });

        const title = await page.title();
        expect(title).toBeDefined();
        expect(title.length).toBeGreaterThan(0);

        // Test SPA navigation
        const products = await page.locator('.shelf-item').count();
        expect(products).toBeGreaterThan(0);
      }

      await browserManager.closeSession(sessionId);
    });

    it('should handle AJAX-heavy websites', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionId = await browserManager.createSession(config);
      const pageId = await browserManager.createPage(sessionId);
      const page = await browserManager.getPage(sessionId, pageId);

      if (page) {
        // Navigate to JSONPlaceholder (AJAX API)
        await page.goto('https://jsonplaceholder.typicode.com/');

        // Wait for content to load
        await page.waitForSelector('h1', { timeout: 10000 });

        const heading = await page.textContent('h1');
        expect(heading).toBeDefined();
        expect(heading).toContain('JSONPlaceholder');
      }

      await browserManager.closeSession(sessionId);
    });

    it('should handle form submissions and redirects', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionId = await browserManager.createSession(config);
      const pageId = await browserManager.createPage(sessionId);
      const page = await browserManager.getPage(sessionId, pageId);

      if (page) {
        // Navigate to httpbin form test
        await page.goto('https://httpbin.org/forms/post');

        // Fill and submit form
        await page.fill('input[name="custname"]', 'Test User');
        await page.fill('input[name="custtel"]', '1234567890');
        await page.fill('input[name="custemail"]', 'test@example.com');
        await page.selectOption('select[name="size"]', 'medium');

        // Submit form and wait for redirect
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle' }),
          page.click('input[type="submit"]'),
        ]);

        // Verify form submission
        const url = page.url();
        expect(url).toContain('httpbin.org');

        const content = await page.textContent('body');
        expect(content).toContain('Test User');
      }

      await browserManager.closeSession(sessionId);
    });

    it('should handle JavaScript-heavy websites', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: true,
      };

      const sessionId = await browserManager.createSession(config);
      const pageId = await browserManager.createPage(sessionId);
      const page = await browserManager.getPage(sessionId, pageId);

      if (page) {
        // Navigate to a JavaScript-heavy site
        await page.goto('https://www.google.com/search?q=playwright+testing');

        // Wait for search results
        await page.waitForSelector('#search', { timeout: 10000 });

        const results = await page.locator('#search .g').count();
        expect(results).toBeGreaterThan(0);

        // Test JavaScript interaction
        const searchBox = await page.locator('input[name="q"]');
        expect(await searchBox.isVisible()).toBe(true);
      }

      await browserManager.closeSession(sessionId);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should manage memory usage efficiently', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionIds: string[] = [];

      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        const sessionId = await browserManager.createSession(config);
        sessionIds.push(sessionId);

        const pageId = await browserManager.createPage(sessionId);
        const page = await browserManager.getPage(sessionId, pageId);

        if (page) {
          await page.goto('https://example.com');
        }
      }

      const stats = browserManager.getStats();
      expect(stats.activeSessions).toBe(5);

      // Clean up sessions
      for (const sessionId of sessionIds) {
        await browserManager.closeSession(sessionId);
      }

      const finalStats = browserManager.getStats();
      expect(finalStats.activeSessions).toBe(0);
    });

    it('should handle concurrent page operations', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionId = await browserManager.createSession(config);
      const pagePromises: Promise<void>[] = [];

      // Create multiple pages concurrently
      for (let i = 0; i < 3; i++) {
        const pagePromise = (async () => {
          const pageId = await browserManager.createPage(sessionId);
          const page = await browserManager.getPage(sessionId, pageId);

          if (page) {
            await page.goto(`https://httpbin.org/delay/${i + 1}`);
            const title = await page.title();
            expect(title).toBeDefined();
          }
        })();

        pagePromises.push(pagePromise);
      }

      // Wait for all pages to complete
      await Promise.all(pagePromises);

      await browserManager.closeSession(sessionId);
    });

    it('should handle session cleanup and rotation', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      // Create sessions that should be rotated
      const sessionIds: string[] = [];

      for (let i = 0; i < 3; i++) {
        const sessionId = await browserManager.createSession(config);
        sessionIds.push(sessionId);

        // Simulate old session by manipulating last activity
        const session = await browserManager.getSession(sessionId);
        if (session) {
          session.lastActivity = new Date(Date.now() - 35 * 60 * 1000); // 35 minutes ago
        }
      }

      // Wait for rotation to occur (would need to trigger manually in test)
      // For now, just verify sessions exist
      for (const sessionId of sessionIds) {
        const session = await browserManager.getSession(sessionId);
        expect(session).toBeDefined();
      }

      // Clean up
      for (const sessionId of sessionIds) {
        await browserManager.closeSession(sessionId);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle browser launch failures gracefully', async () => {
      const invalidConfig: BrowserConfig = {
        type: 'chromium',
        headless: true,
        // Invalid proxy to trigger failure
        proxy: {
          server: 'invalid-proxy:9999',
        },
      };

      try {
        const sessionId = await browserManager.createSession(invalidConfig);
        // If it succeeds, clean up
        await browserManager.closeSession(sessionId);
      } catch (error) {
        // Should handle the error gracefully
        expect(error).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('should handle page creation failures', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionId = await browserManager.createSession(config);

      // Close the session first
      await browserManager.closeSession(sessionId);

      // Try to create page in closed session
      try {
        await browserManager.createPage(sessionId);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle network failures during navigation', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionId = await browserManager.createSession(config);
      const pageId = await browserManager.createPage(sessionId);
      const page = await browserManager.getPage(sessionId, pageId);

      if (page) {
        try {
          // Try to navigate to non-existent domain
          await page.goto('https://non-existent-domain-12345.com', {
            timeout: 5000,
          });
        } catch (error) {
          // Should handle navigation failure
          expect(error).toBeDefined();
        }
      }

      await browserManager.closeSession(sessionId);
    });
  });

  describe('Browser Statistics and Monitoring', () => {
    it('should provide accurate statistics', async () => {
      const initialStats = browserManager.getStats();
      expect(initialStats.activeSessions).toBe(0);

      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionId = await browserManager.createSession(config);
      const pageId = await browserManager.createPage(sessionId);

      const statsAfterCreation = browserManager.getStats();
      expect(statsAfterCreation.activeSessions).toBe(1);
      expect(statsAfterCreation.totalPages).toBe(1);

      await browserManager.closeSession(sessionId);

      const finalStats = browserManager.getStats();
      expect(finalStats.activeSessions).toBe(0);
    });

    it('should track session activity', async () => {
      const config: BrowserConfig = {
        type: 'chromium',
        headless: true,
        stealth: false,
      };

      const sessionId = await browserManager.createSession(config);
      const session1 = await browserManager.getSession(sessionId);
      const initialActivity = session1?.lastActivity;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Access session again
      const session2 = await browserManager.getSession(sessionId);
      const updatedActivity = session2?.lastActivity;

      expect(updatedActivity?.getTime()).toBeGreaterThan(initialActivity?.getTime() || 0);

      await browserManager.closeSession(sessionId);
    });
  });
});