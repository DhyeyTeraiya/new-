import { Page } from 'playwright';
import { 
  ScreenshotMetadata, 
  ViewportInfo, 
  ElementBounds 
} from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  format?: 'png' | 'jpeg';
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  highlightElements?: ElementBounds[];
  annotations?: {
    text: string;
    x: number;
    y: number;
    color?: string;
  }[];
}

export class ScreenshotCapture {
  private readonly logger: Logger;

  constructor() {
    this.logger = createLogger('ScreenshotCapture');
  }

  /**
   * Capture screenshot of the page
   */
  async captureScreenshot(
    page: Page,
    options: ScreenshotOptions = {}
  ): Promise<string> {
    const startTime = Date.now();

    try {
      this.logger.debug('Capturing screenshot', {
        fullPage: options.fullPage,
        format: options.format || 'png',
        hasClip: !!options.clip,
      });

      // Prepare screenshot options
      const screenshotOptions: any = {
        type: options.format || 'png',
        quality: options.quality || (options.format === 'jpeg' ? 80 : undefined),
        fullPage: options.fullPage || false,
        clip: options.clip,
      };

      // Add highlights if requested
      if (options.highlightElements?.length) {
        await this.addHighlights(page, options.highlightElements);
      }

      // Add annotations if requested
      if (options.annotations?.length) {
        await this.addAnnotations(page, options.annotations);
      }

      // Capture screenshot
      const screenshotBuffer = await page.screenshot(screenshotOptions);
      const base64Screenshot = screenshotBuffer.toString('base64');

      // Remove highlights and annotations
      if (options.highlightElements?.length || options.annotations?.length) {
        await this.removeOverlays(page);
      }

      const captureTime = Date.now() - startTime;
      this.logger.debug('Screenshot captured', {
        size: screenshotBuffer.length,
        captureTime,
        format: options.format || 'png',
      });

      return base64Screenshot;
    } catch (error) {
      this.logger.error('Screenshot capture failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Capture screenshot with metadata
   */
  async captureWithMetadata(
    page: Page,
    options: ScreenshotOptions = {}
  ): Promise<{
    data: string;
    metadata: ScreenshotMetadata;
  }> {
    const screenshot = await this.captureScreenshot(page, options);
    const metadata = await this.generateMetadata(page, options);

    return {
      data: screenshot,
      metadata,
    };
  }

  /**
   * Capture element screenshot
   */
  async captureElement(
    page: Page,
    selector: string,
    options: Omit<ScreenshotOptions, 'fullPage' | 'clip'> = {}
  ): Promise<string> {
    try {
      const element = page.locator(selector).first();
      const boundingBox = await element.boundingBox();

      if (!boundingBox) {
        throw new Error('Element not found or not visible');
      }

      return await this.captureScreenshot(page, {
        ...options,
        clip: boundingBox,
      });
    } catch (error) {
      this.logger.error('Element screenshot capture failed', {
        selector,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Capture multiple screenshots for comparison
   */
  async captureComparison(
    page: Page,
    actions: Array<() => Promise<void>>,
    options: ScreenshotOptions = {}
  ): Promise<string[]> {
    const screenshots: string[] = [];

    // Capture initial screenshot
    screenshots.push(await this.captureScreenshot(page, options));

    // Execute actions and capture screenshots
    for (const action of actions) {
      await action();
      await page.waitForTimeout(500); // Allow time for changes
      screenshots.push(await this.captureScreenshot(page, options));
    }

    return screenshots;
  }

  /**
   * Capture scrolling screenshots to get full page content
   */
  async captureScrollingScreenshots(
    page: Page,
    options: ScreenshotOptions = {}
  ): Promise<string[]> {
    const screenshots: string[] = [];
    const viewport = page.viewportSize();
    
    if (!viewport) {
      throw new Error('Viewport size not available');
    }

    // Get page height
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = viewport.height;
    
    let currentScroll = 0;
    
    while (currentScroll < pageHeight) {
      // Scroll to current position
      await page.evaluate((scroll) => window.scrollTo(0, scroll), currentScroll);
      await page.waitForTimeout(200); // Allow time for scroll

      // Capture screenshot
      const screenshot = await this.captureScreenshot(page, {
        ...options,
        fullPage: false,
      });
      screenshots.push(screenshot);

      currentScroll += viewportHeight * 0.8; // 20% overlap
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));

    return screenshots;
  }

  /**
   * Private helper methods
   */
  private async generateMetadata(
    page: Page,
    options: ScreenshotOptions
  ): Promise<ScreenshotMetadata> {
    const viewport = page.viewportSize();
    const url = page.url();
    const title = await page.title().catch(() => '');

    const viewportInfo: ViewportInfo = {
      width: viewport?.width || 0,
      height: viewport?.height || 0,
      scrollX: await page.evaluate(() => window.scrollX),
      scrollY: await page.evaluate(() => window.scrollY),
      devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
    };

    return {
      width: options.clip?.width || viewport?.width || 0,
      height: options.clip?.height || viewport?.height || 0,
      timestamp: new Date(),
      url,
      viewport: viewportInfo,
      highlights: options.highlightElements,
    };
  }

  private async addHighlights(
    page: Page,
    highlights: ElementBounds[]
  ): Promise<void> {
    await page.evaluate((highlights) => {
      // Create highlight overlay
      const overlay = document.createElement('div');
      overlay.id = 'kiro-screenshot-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      `;

      highlights.forEach((highlight, index) => {
        const highlightDiv = document.createElement('div');
        highlightDiv.className = 'kiro-highlight';
        highlightDiv.style.cssText = `
          position: absolute;
          left: ${highlight.x}px;
          top: ${highlight.y}px;
          width: ${highlight.width}px;
          height: ${highlight.height}px;
          border: 3px solid #ff0000;
          background-color: rgba(255, 0, 0, 0.1);
          box-sizing: border-box;
        `;
        overlay.appendChild(highlightDiv);
      });

      document.body.appendChild(overlay);
    }, highlights);
  }

  private async addAnnotations(
    page: Page,
    annotations: NonNullable<ScreenshotOptions['annotations']>
  ): Promise<void> {
    await page.evaluate((annotations) => {
      let overlay = document.getElementById('kiro-screenshot-overlay');
      
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'kiro-screenshot-overlay';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 999999;
        `;
        document.body.appendChild(overlay);
      }

      annotations.forEach((annotation) => {
        const annotationDiv = document.createElement('div');
        annotationDiv.className = 'kiro-annotation';
        annotationDiv.textContent = annotation.text;
        annotationDiv.style.cssText = `
          position: absolute;
          left: ${annotation.x}px;
          top: ${annotation.y}px;
          background-color: ${annotation.color || '#ffff00'};
          color: #000000;
          padding: 4px 8px;
          border-radius: 4px;
          font-family: Arial, sans-serif;
          font-size: 12px;
          font-weight: bold;
          border: 1px solid #000000;
        `;
        overlay.appendChild(annotationDiv);
      });
    }, annotations);
  }

  private async removeOverlays(page: Page): Promise<void> {
    await page.evaluate(() => {
      const overlay = document.getElementById('kiro-screenshot-overlay');
      if (overlay) {
        overlay.remove();
      }
    });
  }

  /**
   * Utility methods for screenshot processing
   */
  async compareScreenshots(
    screenshot1: string,
    screenshot2: string
  ): Promise<{
    similarity: number;
    differences: ElementBounds[];
  }> {
    // This would implement image comparison logic
    // For now, return a placeholder
    return {
      similarity: 0.95,
      differences: [],
    };
  }

  async optimizeScreenshot(
    screenshot: string,
    options: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
      format?: 'png' | 'jpeg';
    } = {}
  ): Promise<string> {
    // This would implement image optimization
    // For now, return the original screenshot
    return screenshot;
  }

  async addWatermark(
    screenshot: string,
    watermark: {
      text: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
      opacity?: number;
    }
  ): Promise<string> {
    // This would implement watermark addition
    // For now, return the original screenshot
    return screenshot;
  }
}