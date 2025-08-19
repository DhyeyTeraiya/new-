import { Page, Locator } from 'playwright';
import { 
  ElementSelector, 
  SelectionStrategy, 
  ElementInfo,
  PageContext 
} from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface ElementSelectorConfig {
  defaultTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  enableSmartWaiting: boolean;
}

export class ElementSelectorService {
  private readonly logger: Logger;
  private readonly config: ElementSelectorConfig;

  constructor(config: ElementSelectorConfig) {
    this.logger = createLogger('ElementSelector');
    this.config = config;
  }

  /**
   * Find element using multiple selection strategies
   */
  async findElement(
    page: Page,
    selector: ElementSelector,
    options?: {
      timeout?: number;
      waitForVisible?: boolean;
      waitForEnabled?: boolean;
    }
  ): Promise<Locator | null> {
    const timeout = options?.timeout || this.config.defaultTimeout;
    const strategies = selector.strategy || ['css', 'xpath', 'text', 'attributes'];

    this.logger.debug('Finding element', {
      selector: JSON.stringify(selector),
      strategies,
      timeout,
    });

    for (const strategy of strategies) {
      try {
        const locator = await this.findByStrategy(page, selector, strategy);
        
        if (locator) {
          // Verify element exists and is actionable
          const isValid = await this.validateElement(locator, options);
          
          if (isValid) {
            this.logger.debug('Element found', { strategy });
            return locator;
          }
        }
      } catch (error) {
        this.logger.debug('Strategy failed', {
          strategy,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        continue;
      }
    }

    this.logger.warn('Element not found with any strategy', {
      selector: JSON.stringify(selector),
      strategies,
    });

    return null;
  }

  /**
   * Find multiple elements matching selector
   */
  async findElements(
    page: Page,
    selector: ElementSelector,
    options?: {
      timeout?: number;
      maxElements?: number;
    }
  ): Promise<Locator[]> {
    const timeout = options?.timeout || this.config.defaultTimeout;
    const maxElements = options?.maxElements || 10;
    const strategies = selector.strategy || ['css', 'xpath', 'text'];

    for (const strategy of strategies) {
      try {
        const locators = await this.findMultipleByStrategy(
          page, 
          selector, 
          strategy, 
          maxElements
        );
        
        if (locators.length > 0) {
          this.logger.debug('Multiple elements found', {
            strategy,
            count: locators.length,
          });
          return locators;
        }
      } catch (error) {
        continue;
      }
    }

    return [];
  }

  /**
   * Get element information for context building
   */
  async getElementInfo(page: Page, locator: Locator): Promise<ElementInfo | null> {
    try {
      const [
        tagName,
        text,
        attributes,
        boundingBox,
        isVisible,
        isEnabled,
      ] = await Promise.all([
        locator.evaluate(el => el.tagName.toLowerCase()),
        locator.textContent(),
        locator.evaluate(el => {
          const attrs: Record<string, string> = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          return attrs;
        }),
        locator.boundingBox(),
        locator.isVisible(),
        locator.isEnabled(),
      ]);

      if (!boundingBox) {
        return null;
      }

      // Generate selectors
      const cssSelector = await this.generateCSSSelector(locator);
      const xpathSelector = await this.generateXPathSelector(locator);

      return {
        id: attributes.id || `element-${Date.now()}`,
        tagName,
        type: attributes.type,
        selector: cssSelector,
        xpath: xpathSelector,
        text: text || '',
        attributes,
        bounds: {
          x: boundingBox.x,
          y: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
        },
        visible: isVisible,
        interactive: this.isInteractiveElement(tagName, attributes),
        role: attributes.role,
      };
    } catch (error) {
      this.logger.error('Failed to get element info', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Extract all interactive elements from page
   */
  async extractPageElements(page: Page): Promise<ElementInfo[]> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Extracting page elements');

      // Get all potentially interactive elements
      const interactiveSelectors = [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[onclick]',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[tabindex]',
        '.btn',
        '.button',
        '.link',
      ];

      const elements: ElementInfo[] = [];
      
      for (const selector of interactiveSelectors) {
        try {
          const locators = await page.locator(selector).all();
          
          for (const locator of locators.slice(0, 20)) { // Limit per selector
            const elementInfo = await this.getElementInfo(page, locator);
            if (elementInfo && elementInfo.visible) {
              elements.push(elementInfo);
            }
          }
        } catch (error) {
          // Continue with next selector
          continue;
        }
      }

      // Remove duplicates based on position and text
      const uniqueElements = this.deduplicateElements(elements);

      const extractionTime = Date.now() - startTime;
      this.logger.info('Page elements extracted', {
        totalElements: uniqueElements.length,
        extractionTime,
      });

      return uniqueElements;
    } catch (error) {
      this.logger.error('Failed to extract page elements', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Smart element waiting with multiple conditions
   */
  async waitForElement(
    page: Page,
    selector: ElementSelector,
    conditions: {
      visible?: boolean;
      enabled?: boolean;
      stable?: boolean;
      timeout?: number;
    } = {}
  ): Promise<Locator | null> {
    const timeout = conditions.timeout || this.config.defaultTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = await this.findElement(page, selector);
      
      if (element) {
        try {
          // Check visibility
          if (conditions.visible !== false) {
            const isVisible = await element.isVisible();
            if (!isVisible) {
              await page.waitForTimeout(100);
              continue;
            }
          }

          // Check enabled state
          if (conditions.enabled !== false) {
            const isEnabled = await element.isEnabled();
            if (!isEnabled) {
              await page.waitForTimeout(100);
              continue;
            }
          }

          // Check stability (element position doesn't change)
          if (conditions.stable) {
            const box1 = await element.boundingBox();
            await page.waitForTimeout(100);
            const box2 = await element.boundingBox();
            
            if (!box1 || !box2 || 
                Math.abs(box1.x - box2.x) > 1 || 
                Math.abs(box1.y - box2.y) > 1) {
              continue;
            }
          }

          return element;
        } catch (error) {
          // Element might have become stale, continue waiting
          await page.waitForTimeout(100);
          continue;
        }
      }

      await page.waitForTimeout(100);
    }

    return null;
  }

  /**
   * Private helper methods
   */
  private async findByStrategy(
    page: Page,
    selector: ElementSelector,
    strategy: SelectionStrategy
  ): Promise<Locator | null> {
    switch (strategy) {
      case 'css':
        if (selector.css) {
          return page.locator(selector.css).first();
        }
        break;

      case 'xpath':
        if (selector.xpath) {
          return page.locator(`xpath=${selector.xpath}`).first();
        }
        break;

      case 'text':
        if (selector.text) {
          // Try exact text match first
          let locator = page.getByText(selector.text, { exact: true });
          if (await locator.count() > 0) {
            return locator.first();
          }
          
          // Try partial text match
          locator = page.getByText(selector.text);
          if (await locator.count() > 0) {
            return locator.first();
          }
        }
        break;

      case 'attributes':
        if (selector.attributes) {
          let cssSelector = '';
          for (const [attr, value] of Object.entries(selector.attributes)) {
            if (attr === 'id') {
              cssSelector += `#${value}`;
            } else if (attr === 'class') {
              cssSelector += `.${value.split(' ').join('.')}`;
            } else {
              cssSelector += `[${attr}="${value}"]`;
            }
          }
          if (cssSelector) {
            return page.locator(cssSelector).first();
          }
        }
        break;

      case 'position':
        // Find element by approximate position
        // This would require more complex logic
        break;

      case 'ai_vision':
        // This would integrate with vision AI to identify elements
        // For now, fallback to other strategies
        break;
    }

    return null;
  }

  private async findMultipleByStrategy(
    page: Page,
    selector: ElementSelector,
    strategy: SelectionStrategy,
    maxElements: number
  ): Promise<Locator[]> {
    let locators: Locator[] = [];

    switch (strategy) {
      case 'css':
        if (selector.css) {
          const allLocators = await page.locator(selector.css).all();
          locators = allLocators.slice(0, maxElements);
        }
        break;

      case 'xpath':
        if (selector.xpath) {
          const allLocators = await page.locator(`xpath=${selector.xpath}`).all();
          locators = allLocators.slice(0, maxElements);
        }
        break;

      case 'text':
        if (selector.text) {
          const allLocators = await page.getByText(selector.text).all();
          locators = allLocators.slice(0, maxElements);
        }
        break;
    }

    return locators;
  }

  private async validateElement(
    locator: Locator,
    options?: {
      waitForVisible?: boolean;
      waitForEnabled?: boolean;
    }
  ): Promise<boolean> {
    try {
      // Check if element exists
      const count = await locator.count();
      if (count === 0) {
        return false;
      }

      // Check visibility if required
      if (options?.waitForVisible !== false) {
        const isVisible = await locator.isVisible();
        if (!isVisible) {
          return false;
        }
      }

      // Check enabled state if required
      if (options?.waitForEnabled !== false) {
        const isEnabled = await locator.isEnabled();
        if (!isEnabled) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async generateCSSSelector(locator: Locator): Promise<string> {
    try {
      return await locator.evaluate(el => {
        // Generate a unique CSS selector for the element
        const path: string[] = [];
        let current = el as Element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.tagName.toLowerCase();
          
          if (current.id) {
            selector += `#${current.id}`;
            path.unshift(selector);
            break;
          }
          
          if (current.className) {
            const classes = current.className.split(' ').filter(c => c);
            if (classes.length > 0) {
              selector += `.${classes.join('.')}`;
            }
          }
          
          // Add nth-child if needed for uniqueness
          const siblings = Array.from(current.parentElement?.children || []);
          const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
          if (sameTagSiblings.length > 1) {
            const index = sameTagSiblings.indexOf(current) + 1;
            selector += `:nth-child(${index})`;
          }
          
          path.unshift(selector);
          current = current.parentElement as Element;
        }

        return path.join(' > ');
      });
    } catch (error) {
      return 'unknown';
    }
  }

  private async generateXPathSelector(locator: Locator): Promise<string> {
    try {
      return await locator.evaluate(el => {
        // Generate XPath for the element
        const path: string[] = [];
        let current = el as Element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.tagName.toLowerCase();
          
          if (current.id) {
            return `//*[@id="${current.id}"]`;
          }
          
          const siblings = Array.from(current.parentElement?.children || []);
          const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
          
          if (sameTagSiblings.length > 1) {
            const index = sameTagSiblings.indexOf(current) + 1;
            selector += `[${index}]`;
          }
          
          path.unshift(selector);
          current = current.parentElement as Element;
        }

        return '//' + path.join('/');
      });
    } catch (error) {
      return '//unknown';
    }
  }

  private isInteractiveElement(tagName: string, attributes: Record<string, string>): boolean {
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
    const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'option'];
    
    return (
      interactiveTags.includes(tagName) ||
      interactiveRoles.includes(attributes.role) ||
      attributes.onclick !== undefined ||
      attributes.tabindex !== undefined ||
      attributes.href !== undefined
    );
  }

  private deduplicateElements(elements: ElementInfo[]): ElementInfo[] {
    const seen = new Set<string>();
    const unique: ElementInfo[] = [];

    for (const element of elements) {
      // Create a key based on position and text
      const key = `${element.bounds.x}-${element.bounds.y}-${element.text}-${element.tagName}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(element);
      }
    }

    return unique;
  }
}