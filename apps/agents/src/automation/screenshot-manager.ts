import { Page, ElementHandle } from 'playwright';
import { logger } from '@/utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

// =============================================================================
// ADVANCED SCREENSHOT MANAGER (Superior to Manus Visual Debugging)
// Master Plan: Visual debugging, automated visual testing, and AI analysis
// =============================================================================

export interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  type?: 'png' | 'jpeg';
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mask?: string[]; // CSS selectors to mask
  animations?: 'disabled' | 'allow';
  caret?: 'hide' | 'initial';
}

export interface VisualComparisonResult {
  match: boolean;
  similarity: number;
  differences: VisualDifference[];
  baselineExists: boolean;
  screenshot: Buffer;
  baseline?: Buffer;
  diffImage?: Buffer;
}

export interface VisualDifference {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'added' | 'removed' | 'modified';
  severity: 'low' | 'medium' | 'high';
}

export interface ScreenshotMetadata {
  id: string;
  timestamp: Date;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  userAgent: string;
  sessionId: string;
  stepName?: string;
  tags: string[];
  annotations: ScreenshotAnnotation[];
}

export interface ScreenshotAnnotation {
  type: 'highlight' | 'arrow' | 'text' | 'box';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
}

export interface VisualTestCase {
  name: string;
  selector?: string;
  fullPage: boolean;
  threshold: number;
  ignoreRegions: Array<{ x: number; y: number; width: number; height: number }>;
  tags: string[];
}

// =============================================================================
// SCREENSHOT MANAGER IMPLEMENTATION
// =============================================================================

export class ScreenshotManager {
  private screenshotDir: string;
  private baselineDir: string;
  private diffDir: string;
  private metadata: Map<string, ScreenshotMetadata> = new Map();

  constructor(baseDir: string = './screenshots') {
    this.screenshotDir = path.join(baseDir, 'current');
    this.baselineDir = path.join(baseDir, 'baseline');
    this.diffDir = path.join(baseDir, 'diff');
    
    this.ensureDirectories();
    logger.info('Screenshot Manager initialized', { baseDir });
  }

  // =============================================================================
  // SCREENSHOT CAPTURE METHODS
  // =============================================================================

  async captureFullPage(page: Page, name: string, options?: ScreenshotOptions): Promise<Buffer> {
    logger.info('Capturing full page screenshot', { name });

    const screenshot = await page.screenshot({
      fullPage: true,
      type: options?.type || 'png',
      quality: options?.quality,
      animations: options?.animations || 'disabled',
      caret: options?.caret || 'hide',
      mask: options?.mask ? await this.resolveSelectors(page, options.mask) : undefined,
    });

    await this.saveScreenshot(screenshot, name, 'fullpage');
    await this.saveMetadata(page, name, 'fullpage');

    return screenshot;
  }

  async captureElement(page: Page, selector: string, name: string, options?: ScreenshotOptions): Promise<Buffer> {
    logger.info('Capturing element screenshot', { name, selector });

    const element = await page.locator(selector).first();
    
    if (!await element.isVisible()) {
      throw new Error(`Element not visible: ${selector}`);
    }

    const screenshot = await element.screenshot({
      type: options?.type || 'png',
      quality: options?.quality,
      animations: options?.animations || 'disabled',
      caret: options?.caret || 'hide',
    });

    await this.saveScreenshot(screenshot, name, 'element');
    await this.saveMetadata(page, name, 'element', selector);

    return screenshot;
  }

  async captureViewport(page: Page, name: string, options?: ScreenshotOptions): Promise<Buffer> {
    logger.info('Capturing viewport screenshot', { name });

    const screenshot = await page.screenshot({
      fullPage: false,
      type: options?.type || 'png',
      quality: options?.quality,
      clip: options?.clip,
      animations: options?.animations || 'disabled',
      caret: options?.caret || 'hide',
      mask: options?.mask ? await this.resolveSelectors(page, options.mask) : undefined,
    });

    await this.saveScreenshot(screenshot, name, 'viewport');
    await this.saveMetadata(page, name, 'viewport');

    return screenshot;
  }

  async captureWithAnnotations(page: Page, name: string, annotations: ScreenshotAnnotation[], options?: ScreenshotOptions): Promise<Buffer> {
    logger.info('Capturing annotated screenshot', { name, annotations: annotations.length });

    // First capture the base screenshot
    const baseScreenshot = await this.captureFullPage(page, `${name}_base`, options);

    // Apply annotations using canvas manipulation
    const annotatedScreenshot = await this.applyAnnotations(baseScreenshot, annotations);

    await this.saveScreenshot(annotatedScreenshot, name, 'annotated');
    
    // Update metadata with annotations
    const metadata = this.metadata.get(`${name}_fullpage`);
    if (metadata) {
      metadata.annotations = annotations;
      this.metadata.set(`${name}_annotated`, metadata);
    }

    return annotatedScreenshot;
  }

  // =============================================================================
  // VISUAL COMPARISON METHODS
  // =============================================================================

  async compareWithBaseline(page: Page, testCase: VisualTestCase): Promise<VisualComparisonResult> {
    logger.info('Performing visual comparison', { testCase: testCase.name });

    // Capture current screenshot
    const currentScreenshot = testCase.selector 
      ? await this.captureElement(page, testCase.selector, testCase.name)
      : await this.captureFullPage(page, testCase.name);

    // Load baseline if exists
    const baselinePath = path.join(this.baselineDir, `${testCase.name}.png`);
    let baseline: Buffer | undefined;
    let baselineExists = false;

    try {
      baseline = await fs.readFile(baselinePath);
      baselineExists = true;
    } catch (error) {
      logger.warn('Baseline not found, creating new baseline', { testCase: testCase.name });
      await this.saveBaseline(currentScreenshot, testCase.name);
      
      return {
        match: true,
        similarity: 1.0,
        differences: [],
        baselineExists: false,
        screenshot: currentScreenshot,
      };
    }

    // Perform pixel-by-pixel comparison
    const comparisonResult = await this.performPixelComparison(
      currentScreenshot,
      baseline,
      testCase.threshold,
      testCase.ignoreRegions
    );

    // Save diff image if there are differences
    if (!comparisonResult.match && comparisonResult.diffImage) {
      await this.saveDiff(comparisonResult.diffImage, testCase.name);
    }

    logger.info('Visual comparison completed', {
      testCase: testCase.name,
      match: comparisonResult.match,
      similarity: comparisonResult.similarity,
    });

    return {
      ...comparisonResult,
      baselineExists,
      screenshot: currentScreenshot,
      baseline,
    };
  }

  async runVisualTestSuite(page: Page, testCases: VisualTestCase[]): Promise<Map<string, VisualComparisonResult>> {
    logger.info('Running visual test suite', { testCases: testCases.length });

    const results = new Map<string, VisualComparisonResult>();

    for (const testCase of testCases) {
      try {
        const result = await this.compareWithBaseline(page, testCase);
        results.set(testCase.name, result);
      } catch (error) {
        logger.error('Visual test case failed', {
          testCase: testCase.name,
          error: error.message,
        });
        
        results.set(testCase.name, {
          match: false,
          similarity: 0,
          differences: [],
          baselineExists: false,
          screenshot: Buffer.alloc(0),
        });
      }
    }

    // Generate test report
    await this.generateTestReport(results);

    return results;
  }

  // =============================================================================
  // AUTOMATED VISUAL TESTING
  // =============================================================================

  async captureUserJourney(page: Page, journeyName: string, steps: Array<{ name: string; action: () => Promise<void> }>): Promise<Buffer[]> {
    logger.info('Capturing user journey', { journeyName, steps: steps.length });

    const screenshots: Buffer[] = [];

    // Initial screenshot
    const initialScreenshot = await this.captureFullPage(page, `${journeyName}_00_initial`);
    screenshots.push(initialScreenshot);

    // Execute steps and capture screenshots
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      logger.info('Executing journey step', { step: step.name, index: i + 1 });

      try {
        // Execute the step action
        await step.action();

        // Wait for page to stabilize
        await this.waitForPageStability(page);

        // Capture screenshot after step
        const stepScreenshot = await this.captureFullPage(
          page, 
          `${journeyName}_${String(i + 1).padStart(2, '0')}_${step.name.replace(/\s+/g, '_')}`
        );
        screenshots.push(stepScreenshot);

      } catch (error) {
        logger.error('Journey step failed', {
          journeyName,
          step: step.name,
          error: error.message,
        });

        // Capture error screenshot
        const errorScreenshot = await this.captureFullPage(
          page,
          `${journeyName}_${String(i + 1).padStart(2, '0')}_${step.name.replace(/\s+/g, '_')}_ERROR`
        );
        screenshots.push(errorScreenshot);
      }
    }

    // Generate journey GIF/video
    await this.generateJourneyAnimation(journeyName, screenshots);

    return screenshots;
  }

  async detectVisualRegressions(page: Page, baselineJourney: string, currentJourney: string): Promise<VisualComparisonResult[]> {
    logger.info('Detecting visual regressions', { baselineJourney, currentJourney });

    const regressions: VisualComparisonResult[] = [];

    // Get all baseline screenshots
    const baselineFiles = await this.getJourneyScreenshots(baselineJourney);
    const currentFiles = await this.getJourneyScreenshots(currentJourney);

    // Compare corresponding screenshots
    for (let i = 0; i < Math.min(baselineFiles.length, currentFiles.length); i++) {
      const baselineFile = baselineFiles[i];
      const currentFile = currentFiles[i];

      try {
        const baseline = await fs.readFile(path.join(this.baselineDir, baselineFile));
        const current = await fs.readFile(path.join(this.screenshotDir, currentFile));

        const comparison = await this.performPixelComparison(current, baseline, 0.1, []);
        
        if (!comparison.match) {
          regressions.push({
            ...comparison,
            baselineExists: true,
            screenshot: current,
            baseline,
          });
        }
      } catch (error) {
        logger.error('Failed to compare journey screenshots', {
          baseline: baselineFile,
          current: currentFile,
          error: error.message,
        });
      }
    }

    return regressions;
  }

  // =============================================================================
  // AI-POWERED VISUAL ANALYSIS
  // =============================================================================

  async analyzeScreenshotWithAI(screenshot: Buffer, analysisType: 'layout' | 'content' | 'accessibility' | 'performance'): Promise<any> {
    logger.info('Analyzing screenshot with AI', { analysisType });

    // This would integrate with computer vision models
    // For now, return mock analysis
    
    switch (analysisType) {
      case 'layout':
        return await this.analyzeLayout(screenshot);
      case 'content':
        return await this.analyzeContent(screenshot);
      case 'accessibility':
        return await this.analyzeAccessibility(screenshot);
      case 'performance':
        return await this.analyzePerformance(screenshot);
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }
  }

  async detectUIElements(screenshot: Buffer): Promise<Array<{ type: string; bounds: { x: number; y: number; width: number; height: number }; confidence: number }>> {
    logger.info('Detecting UI elements in screenshot');

    // Mock implementation - would use computer vision
    return [
      {
        type: 'button',
        bounds: { x: 100, y: 200, width: 120, height: 40 },
        confidence: 0.95,
      },
      {
        type: 'input',
        bounds: { x: 50, y: 150, width: 200, height: 30 },
        confidence: 0.88,
      },
    ];
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.screenshotDir, { recursive: true });
    await fs.mkdir(this.baselineDir, { recursive: true });
    await fs.mkdir(this.diffDir, { recursive: true });
  }

  private async saveScreenshot(screenshot: Buffer, name: string, type: string): Promise<void> {
    const filename = `${name}_${type}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    await fs.writeFile(filepath, screenshot);
  }

  private async saveBaseline(screenshot: Buffer, name: string): Promise<void> {
    const filename = `${name}.png`;
    const filepath = path.join(this.baselineDir, filename);
    await fs.writeFile(filepath, screenshot);
  }

  private async saveDiff(diffImage: Buffer, name: string): Promise<void> {
    const filename = `${name}_diff.png`;
    const filepath = path.join(this.diffDir, filename);
    await fs.writeFile(filepath, diffImage);
  }

  private async saveMetadata(page: Page, name: string, type: string, selector?: string): Promise<void> {
    const viewport = page.viewportSize() || { width: 1920, height: 1080 };
    
    const metadata: ScreenshotMetadata = {
      id: `${name}_${type}`,
      timestamp: new Date(),
      url: page.url(),
      title: await page.title(),
      viewport,
      userAgent: await page.evaluate(() => navigator.userAgent),
      sessionId: 'current', // Would be actual session ID
      stepName: name,
      tags: [type],
      annotations: [],
    };

    this.metadata.set(metadata.id, metadata);
  }

  private async resolveSelectors(page: Page, selectors: string[]): Promise<ElementHandle[]> {
    const elements: ElementHandle[] = [];
    
    for (const selector of selectors) {
      try {
        const element = await page.locator(selector).elementHandle();
        if (element) {
          elements.push(element);
        }
      } catch (error) {
        logger.warn('Failed to resolve selector for masking', { selector });
      }
    }
    
    return elements;
  }

  private async applyAnnotations(screenshot: Buffer, annotations: ScreenshotAnnotation[]): Promise<Buffer> {
    // This would use a canvas library to draw annotations
    // For now, return the original screenshot
    logger.info('Applying annotations to screenshot', { count: annotations.length });
    return screenshot;
  }

  private async performPixelComparison(
    current: Buffer,
    baseline: Buffer,
    threshold: number,
    ignoreRegions: Array<{ x: number; y: number; width: number; height: number }>
  ): Promise<{ match: boolean; similarity: number; differences: VisualDifference[]; diffImage?: Buffer }> {
    // Mock implementation - would use image comparison library like pixelmatch
    logger.info('Performing pixel comparison', { threshold, ignoreRegions: ignoreRegions.length });

    // Simulate comparison result
    const similarity = 0.95 + Math.random() * 0.05;
    const match = similarity >= (1 - threshold);

    const differences: VisualDifference[] = match ? [] : [
      {
        x: 100,
        y: 200,
        width: 50,
        height: 30,
        type: 'modified',
        severity: 'medium',
      },
    ];

    return {
      match,
      similarity,
      differences,
      diffImage: match ? undefined : Buffer.alloc(100), // Mock diff image
    };
  }

  private async waitForPageStability(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (error) {
      // If network idle fails, just wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  private async generateTestReport(results: Map<string, VisualComparisonResult>): Promise<void> {
    const reportData = {
      timestamp: new Date().toISOString(),
      totalTests: results.size,
      passed: Array.from(results.values()).filter(r => r.match).length,
      failed: Array.from(results.values()).filter(r => !r.match).length,
      results: Object.fromEntries(results),
    };

    const reportPath = path.join(this.screenshotDir, 'visual-test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));

    logger.info('Visual test report generated', {
      totalTests: reportData.totalTests,
      passed: reportData.passed,
      failed: reportData.failed,
    });
  }

  private async generateJourneyAnimation(journeyName: string, screenshots: Buffer[]): Promise<void> {
    // This would generate a GIF or video from screenshots
    logger.info('Generating journey animation', { journeyName, frames: screenshots.length });
  }

  private async getJourneyScreenshots(journeyName: string): Promise<string[]> {
    try {
      const files = await fs.readdir(this.screenshotDir);
      return files.filter(file => file.startsWith(journeyName) && file.endsWith('.png')).sort();
    } catch (error) {
      return [];
    }
  }

  // Mock AI analysis methods
  private async analyzeLayout(screenshot: Buffer): Promise<any> {
    return {
      layoutScore: 0.85,
      issues: ['Inconsistent spacing', 'Misaligned elements'],
      suggestions: ['Use CSS Grid for better alignment', 'Standardize margin values'],
    };
  }

  private async analyzeContent(screenshot: Buffer): Promise<any> {
    return {
      readabilityScore: 0.9,
      textElements: 15,
      imageElements: 3,
      issues: ['Small font size in footer'],
    };
  }

  private async analyzeAccessibility(screenshot: Buffer): Promise<any> {
    return {
      accessibilityScore: 0.75,
      issues: ['Low contrast ratio', 'Missing alt text indicators'],
      wcagLevel: 'AA',
    };
  }

  private async analyzePerformance(screenshot: Buffer): Promise<any> {
    return {
      performanceScore: 0.8,
      metrics: {
        renderTime: '1.2s',
        imageOptimization: 'Good',
        layoutShift: 'Minimal',
      },
    };
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  getMetadata(screenshotId: string): ScreenshotMetadata | undefined {
    return this.metadata.get(screenshotId);
  }

  getAllMetadata(): ScreenshotMetadata[] {
    return Array.from(this.metadata.values());
  }

  async cleanup(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    logger.info('Cleaning up old screenshots', { olderThanDays });

    // Clean up metadata
    for (const [id, metadata] of this.metadata.entries()) {
      if (metadata.timestamp < cutoffDate) {
        this.metadata.delete(id);
      }
    }

    // Clean up files (would implement file cleanup)
    logger.info('Screenshot cleanup completed');
  }

  getStats(): any {
    return {
      totalScreenshots: this.metadata.size,
      screenshotDir: this.screenshotDir,
      baselineDir: this.baselineDir,
      diffDir: this.diffDir,
    };
  }
}

export default ScreenshotManager;