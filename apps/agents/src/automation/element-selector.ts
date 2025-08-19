import { Page, Locator, ElementHandle } from 'playwright';
import { logger } from '@/utils/logger';
import { MultiLLMService, LLMRequest } from '@/services/ai/multi-llm-service';
import { TaskType, AgentType } from '@browser-ai-agent/shared/types/agent';

// =============================================================================
// AI-POWERED ELEMENT SELECTOR (Superior to Manus Element Detection)
// Master Plan: Computer vision + DOM analysis for intelligent element selection
// =============================================================================

export interface ElementSelector {
  type: 'css' | 'xpath' | 'text' | 'placeholder' | 'role' | 'testid' | 'ai-generated';
  value: string;
  confidence: number;
  fallbacks?: ElementSelector[];
}

export interface ElementContext {
  description: string;
  expectedType: 'button' | 'input' | 'link' | 'text' | 'image' | 'form' | 'any';
  attributes?: Record<string, string>;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  nearbyText?: string;
  parentContext?: string;
}

export interface ElementAnalysis {
  element: ElementHandle;
  selector: ElementSelector;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, string>;
  text: string;
  isVisible: boolean;
  isEnabled: boolean;
  isClickable: boolean;
  screenshot?: Buffer;
}

export interface SelectorStrategy {
  name: string;
  priority: number;
  generate: (context: ElementContext, page: Page) => Promise<ElementSelector[]>;
  validate: (selector: ElementSelector, page: Page) => Promise<boolean>;
}

// =============================================================================
// ADVANCED ELEMENT SELECTOR IMPLEMENTATION
// =============================================================================

export class AIElementSelector {
  private llmService: MultiLLMService;
  private strategies: SelectorStrategy[];
  private selectorCache: Map<string, ElementSelector[]> = new Map();

  constructor() {
    this.llmService = MultiLLMService.getInstance();
    this.strategies = this.initializeStrategies();
    logger.info('AI Element Selector initialized');
  }

  // =============================================================================
  // MAIN SELECTION METHODS
  // =============================================================================

  async findElement(page: Page, context: ElementContext): Promise<ElementAnalysis | null> {
    logger.info('Finding element with AI selector', {
      description: context.description,
      expectedType: context.expectedType,
    });

    try {
      // Generate multiple selector strategies
      const selectors = await this.generateSelectors(page, context);
      
      // Try each selector in order of confidence
      for (const selector of selectors) {
        const element = await this.trySelector(page, selector);
        
        if (element) {
          const analysis = await this.analyzeElement(element, selector, page);
          
          if (this.validateElement(analysis, context)) {
            logger.info('Element found successfully', {
              selector: selector.value,
              type: selector.type,
              confidence: selector.confidence,
            });
            
            return analysis;
          }
        }
      }

      // If no direct selectors work, try AI-powered visual selection
      return await this.findElementWithAI(page, context);
    } catch (error) {
      logger.error('Element selection failed', {
        description: context.description,
        error: error.message,
      });
      return null;
    }
  }

  async findElements(page: Page, context: ElementContext): Promise<ElementAnalysis[]> {
    logger.info('Finding multiple elements', {
      description: context.description,
      expectedType: context.expectedType,
    });

    const selectors = await this.generateSelectors(page, context);
    const results: ElementAnalysis[] = [];

    for (const selector of selectors) {
      const elements = await this.tryMultipleSelectors(page, selector);
      
      for (const element of elements) {
        const analysis = await this.analyzeElement(element, selector, page);
        
        if (this.validateElement(analysis, context)) {
          results.push(analysis);
        }
      }
      
      // If we found elements with this selector, use them
      if (results.length > 0) {
        break;
      }
    }

    return results;
  }

  // =============================================================================
  // SELECTOR GENERATION
  // =============================================================================

  private async generateSelectors(page: Page, context: ElementContext): Promise<ElementSelector[]> {
    const cacheKey = this.getCacheKey(context);
    
    // Check cache first
    if (this.selectorCache.has(cacheKey)) {
      return this.selectorCache.get(cacheKey)!;
    }

    const allSelectors: ElementSelector[] = [];

    // Run all strategies in parallel
    const strategyPromises = this.strategies.map(async (strategy) => {
      try {
        return await strategy.generate(context, page);
      } catch (error) {
        logger.warn('Strategy failed', {
          strategy: strategy.name,
          error: error.message,
        });
        return [];
      }
    });

    const strategyResults = await Promise.all(strategyPromises);
    
    // Combine and sort by confidence
    for (const selectors of strategyResults) {
      allSelectors.push(...selectors);
    }

    // Sort by confidence and priority
    allSelectors.sort((a, b) => b.confidence - a.confidence);

    // Cache the results
    this.selectorCache.set(cacheKey, allSelectors);

    return allSelectors;
  }

  private initializeStrategies(): SelectorStrategy[] {
    return [
      {
        name: 'semantic-attributes',
        priority: 10,
        generate: this.generateSemanticSelectors.bind(this),
        validate: this.validateSelector.bind(this),
      },
      {
        name: 'text-content',
        priority: 9,
        generate: this.generateTextSelectors.bind(this),
        validate: this.validateSelector.bind(this),
      },
      {
        name: 'css-selectors',
        priority: 8,
        generate: this.generateCSSSelectors.bind(this),
        validate: this.validateSelector.bind(this),
      },
      {
        name: 'xpath-selectors',
        priority: 7,
        generate: this.generateXPathSelectors.bind(this),
        validate: this.validateSelector.bind(this),
      },
      {
        name: 'ai-generated',
        priority: 6,
        generate: this.generateAISelectors.bind(this),
        validate: this.validateSelector.bind(this),
      },
    ];
  }

  // =============================================================================
  // SEMANTIC SELECTOR GENERATION
  // =============================================================================

  private async generateSemanticSelectors(context: ElementContext, page: Page): Promise<ElementSelector[]> {
    const selectors: ElementSelector[] = [];

    // Role-based selectors
    if (context.expectedType === 'button') {
      selectors.push({
        type: 'css',
        value: `button:has-text("${context.description}")`,
        confidence: 0.9,
      });
      
      selectors.push({
        type: 'css',
        value: `[role="button"]:has-text("${context.description}")`,
        confidence: 0.85,
      });
    }

    // Input field selectors
    if (context.expectedType === 'input') {
      if (context.attributes?.placeholder) {
        selectors.push({
          type: 'css',
          value: `input[placeholder*="${context.attributes.placeholder}"]`,
          confidence: 0.95,
        });
      }
      
      if (context.attributes?.name) {
        selectors.push({
          type: 'css',
          value: `input[name="${context.attributes.name}"]`,
          confidence: 0.9,
        });
      }
    }

    // Link selectors
    if (context.expectedType === 'link') {
      selectors.push({
        type: 'css',
        value: `a:has-text("${context.description}")`,
        confidence: 0.9,
      });
    }

    // Test ID selectors (highest priority)
    if (context.attributes?.testid) {
      selectors.push({
        type: 'testid',
        value: context.attributes.testid,
        confidence: 0.98,
      });
    }

    return selectors;
  }

  // =============================================================================
  // TEXT-BASED SELECTOR GENERATION
  // =============================================================================

  private async generateTextSelectors(context: ElementContext, page: Page): Promise<ElementSelector[]> {
    const selectors: ElementSelector[] = [];
    const description = context.description.toLowerCase();

    // Exact text match
    selectors.push({
      type: 'text',
      value: context.description,
      confidence: 0.85,
    });

    // Partial text match
    const words = description.split(' ');
    if (words.length > 1) {
      for (const word of words) {
        if (word.length > 3) { // Skip short words
          selectors.push({
            type: 'text',
            value: word,
            confidence: 0.7,
          });
        }
      }
    }

    // Nearby text context
    if (context.nearbyText) {
      selectors.push({
        type: 'xpath',
        value: `//*[contains(text(), "${context.nearbyText}")]/following::*[contains(text(), "${context.description}")]`,
        confidence: 0.8,
      });
    }

    return selectors;
  }

  // =============================================================================
  // CSS SELECTOR GENERATION
  // =============================================================================

  private async generateCSSSelectors(context: ElementContext, page: Page): Promise<ElementSelector[]> {
    const selectors: ElementSelector[] = [];

    // Get page structure for intelligent CSS generation
    const pageStructure = await this.analyzePage(page);

    // Generate type-specific CSS selectors
    switch (context.expectedType) {
      case 'button':
        selectors.push(
          { type: 'css', value: 'button[type="submit"]', confidence: 0.8 },
          { type: 'css', value: '.btn, .button', confidence: 0.7 },
          { type: 'css', value: 'input[type="submit"]', confidence: 0.75 }
        );
        break;
        
      case 'input':
        if (context.description.toLowerCase().includes('email')) {
          selectors.push({ type: 'css', value: 'input[type="email"]', confidence: 0.9 });
        }
        if (context.description.toLowerCase().includes('password')) {
          selectors.push({ type: 'css', value: 'input[type="password"]', confidence: 0.9 });
        }
        selectors.push({ type: 'css', value: 'input[type="text"]', confidence: 0.7 });
        break;
        
      case 'link':
        selectors.push({ type: 'css', value: 'a[href]', confidence: 0.8 });
        break;
    }

    // Generate selectors based on common patterns
    const commonPatterns = [
      '.login', '.signin', '.signup', '.register',
      '.search', '.submit', '.send', '.continue',
      '.next', '.prev', '.back', '.cancel',
    ];

    for (const pattern of commonPatterns) {
      if (context.description.toLowerCase().includes(pattern.substring(1))) {
        selectors.push({
          type: 'css',
          value: pattern,
          confidence: 0.75,
        });
      }
    }

    return selectors;
  }

  // =============================================================================
  // XPATH SELECTOR GENERATION
  // =============================================================================

  private async generateXPathSelectors(context: ElementContext, page: Page): Promise<ElementSelector[]> {
    const selectors: ElementSelector[] = [];
    const desc = context.description;

    // Text-based XPath selectors
    selectors.push({
      type: 'xpath',
      value: `//*[text()="${desc}"]`,
      confidence: 0.85,
    });

    selectors.push({
      type: 'xpath',
      value: `//*[contains(text(), "${desc}")]`,
      confidence: 0.8,
    });

    // Attribute-based XPath selectors
    if (context.attributes) {
      for (const [attr, value] of Object.entries(context.attributes)) {
        selectors.push({
          type: 'xpath',
          value: `//*[@${attr}="${value}"]`,
          confidence: 0.9,
        });
        
        selectors.push({
          type: 'xpath',
          value: `//*[contains(@${attr}, "${value}")]`,
          confidence: 0.85,
        });
      }
    }

    // Position-based XPath selectors
    if (context.position) {
      const positionXPath = this.generatePositionXPath(context.expectedType, context.position);
      if (positionXPath) {
        selectors.push({
          type: 'xpath',
          value: positionXPath,
          confidence: 0.7,
        });
      }
    }

    return selectors;
  }

  // =============================================================================
  // AI-POWERED SELECTOR GENERATION
  // =============================================================================

  private async generateAISelectors(context: ElementContext, page: Page): Promise<ElementSelector[]> {
    logger.info('Generating AI-powered selectors', {
      description: context.description,
      expectedType: context.expectedType,
    });

    try {
      // Get page HTML for analysis
      const html = await page.content();
      const pageTitle = await page.title();
      const url = page.url();

      const llmRequest: LLMRequest = {
        taskContext: {
          type: TaskType.DATA_EXTRACTION,
          agent_type: AgentType.EXTRACTOR,
          complexity: 'high',
          priority: 'medium',
          user_tier: 'premium',
        },
        messages: [
          {
            role: 'user',
            content: `Analyze this HTML page and generate CSS/XPath selectors for the following element:

Description: ${context.description}
Expected Type: ${context.expectedType}
Page Title: ${pageTitle}
Page URL: ${url}

Context:
${context.nearbyText ? `Nearby Text: ${context.nearbyText}` : ''}
${context.parentContext ? `Parent Context: ${context.parentContext}` : ''}
${context.attributes ? `Expected Attributes: ${JSON.stringify(context.attributes)}` : ''}

HTML (first 5000 chars):
${html.substring(0, 5000)}

Generate 3-5 CSS selectors and 2-3 XPath selectors that would reliably find this element.
Return as JSON array with format:
[
  {
    "type": "css",
    "value": "selector",
    "confidence": 0.9,
    "reasoning": "why this selector should work"
  }
]

Focus on:
1. Semantic HTML attributes (data-testid, aria-label, role)
2. Unique class names and IDs
3. Text content matching
4. Structural relationships
5. Form field attributes (name, placeholder, type)`,
          },
        ],
        systemPrompt: 'You are an expert web scraping engineer. Generate reliable, specific CSS and XPath selectors that will work across different page states.',
        temperature: 0.3,
      };

      const response = await this.llmService.complete(llmRequest);
      
      try {
        const aiSelectors = JSON.parse(response.content);
        
        return aiSelectors.map((selector: any) => ({
          type: selector.type,
          value: selector.value,
          confidence: selector.confidence * 0.8, // Slightly reduce AI confidence
        }));
      } catch (parseError) {
        logger.warn('Failed to parse AI selector response', {
          response: response.content,
          error: parseError.message,
        });
        return [];
      }
    } catch (error) {
      logger.error('AI selector generation failed', {
        error: error.message,
      });
      return [];
    }
  }

  // =============================================================================
  // ELEMENT ANALYSIS AND VALIDATION
  // =============================================================================

  private async analyzeElement(element: ElementHandle, selector: ElementSelector, page: Page): Promise<ElementAnalysis> {
    const boundingBox = await element.boundingBox() || { x: 0, y: 0, width: 0, height: 0 };
    const attributes: Record<string, string> = {};
    
    // Get all attributes
    const attributeNames = await element.evaluate((el) => {
      const attrs: Record<string, string> = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      return attrs;
    });
    
    Object.assign(attributes, attributeNames);

    // Get text content
    const text = await element.textContent() || '';
    
    // Check visibility and interactability
    const isVisible = await element.isVisible();
    const isEnabled = await element.isEnabled();
    const isClickable = boundingBox.width > 0 && boundingBox.height > 0 && isVisible && isEnabled;

    // Take screenshot for visual verification
    let screenshot: Buffer | undefined;
    try {
      screenshot = await element.screenshot();
    } catch (error) {
      // Screenshot might fail for some elements
    }

    return {
      element,
      selector,
      confidence: selector.confidence,
      boundingBox,
      attributes,
      text,
      isVisible,
      isEnabled,
      isClickable,
      screenshot,
    };
  }

  private validateElement(analysis: ElementAnalysis, context: ElementContext): boolean {
    // Check if element type matches expectation
    const tagName = analysis.attributes.tagName?.toLowerCase();
    
    switch (context.expectedType) {
      case 'button':
        if (tagName !== 'button' && analysis.attributes.type !== 'submit' && analysis.attributes.role !== 'button') {
          return false;
        }
        break;
        
      case 'input':
        if (tagName !== 'input' && tagName !== 'textarea') {
          return false;
        }
        break;
        
      case 'link':
        if (tagName !== 'a' || !analysis.attributes.href) {
          return false;
        }
        break;
    }

    // Check if element is interactable
    if (!analysis.isVisible || !analysis.isEnabled) {
      return false;
    }

    // Check text content if specified
    if (context.description && analysis.text) {
      const normalizedText = analysis.text.toLowerCase().trim();
      const normalizedDesc = context.description.toLowerCase().trim();
      
      if (!normalizedText.includes(normalizedDesc) && !normalizedDesc.includes(normalizedText)) {
        // Allow partial matches for buttons and links
        if (context.expectedType === 'button' || context.expectedType === 'link') {
          const words = normalizedDesc.split(' ');
          const hasAnyWord = words.some(word => normalizedText.includes(word));
          if (!hasAnyWord) {
            return false;
          }
        } else {
          return false;
        }
      }
    }

    return true;
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private async trySelector(page: Page, selector: ElementSelector): Promise<ElementHandle | null> {
    try {
      let locator: Locator;
      
      switch (selector.type) {
        case 'css':
          locator = page.locator(selector.value);
          break;
        case 'xpath':
          locator = page.locator(`xpath=${selector.value}`);
          break;
        case 'text':
          locator = page.getByText(selector.value);
          break;
        case 'placeholder':
          locator = page.getByPlaceholder(selector.value);
          break;
        case 'role':
          locator = page.getByRole(selector.value as any);
          break;
        case 'testid':
          locator = page.getByTestId(selector.value);
          break;
        default:
          return null;
      }

      // Wait for element with short timeout
      await locator.waitFor({ timeout: 2000 });
      
      return await locator.elementHandle();
    } catch (error) {
      return null;
    }
  }

  private async tryMultipleSelectors(page: Page, selector: ElementSelector): Promise<ElementHandle[]> {
    try {
      let locator: Locator;
      
      switch (selector.type) {
        case 'css':
          locator = page.locator(selector.value);
          break;
        case 'xpath':
          locator = page.locator(`xpath=${selector.value}`);
          break;
        default:
          return [];
      }

      const count = await locator.count();
      const elements: ElementHandle[] = [];
      
      for (let i = 0; i < count; i++) {
        const element = await locator.nth(i).elementHandle();
        if (element) {
          elements.push(element);
        }
      }
      
      return elements;
    } catch (error) {
      return [];
    }
  }

  private async validateSelector(selector: ElementSelector, page: Page): Promise<boolean> {
    const element = await this.trySelector(page, selector);
    return element !== null;
  }

  private async analyzePage(page: Page): Promise<any> {
    return await page.evaluate(() => {
      const forms = document.querySelectorAll('form').length;
      const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]').length;
      const inputs = document.querySelectorAll('input, textarea, select').length;
      const links = document.querySelectorAll('a[href]').length;
      
      return {
        forms,
        buttons,
        inputs,
        links,
        title: document.title,
        url: window.location.href,
      };
    });
  }

  private generatePositionXPath(elementType: string, position: string): string | null {
    const typeMap = {
      button: 'button | input[@type="submit"] | input[@type="button"]',
      input: 'input | textarea',
      link: 'a[@href]',
      any: '*',
    };

    const xpath = typeMap[elementType] || typeMap.any;

    switch (position) {
      case 'top':
        return `(//${xpath})[1]`;
      case 'bottom':
        return `(//${xpath})[last()]`;
      case 'center':
        return `(//${xpath})[position() = ceiling(last() div 2)]`;
      default:
        return null;
    }
  }

  private getCacheKey(context: ElementContext): string {
    return JSON.stringify({
      description: context.description,
      expectedType: context.expectedType,
      attributes: context.attributes,
      nearbyText: context.nearbyText,
    });
  }

  private async findElementWithAI(page: Page, context: ElementContext): Promise<ElementAnalysis | null> {
    logger.info('Attempting AI-powered visual element detection', {
      description: context.description,
    });

    try {
      // Take screenshot of the page
      const screenshot = await page.screenshot({ fullPage: true });
      
      // Use AI to analyze the screenshot and find the element
      // This would integrate with computer vision models
      // For now, return null as this requires additional CV setup
      
      logger.warn('AI visual detection not yet implemented');
      return null;
    } catch (error) {
      logger.error('AI visual detection failed', {
        error: error.message,
      });
      return null;
    }
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  clearCache(): void {
    this.selectorCache.clear();
    logger.info('Selector cache cleared');
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.selectorCache.size,
      keys: Array.from(this.selectorCache.keys()),
    };
  }
}

export default AIElementSelector;