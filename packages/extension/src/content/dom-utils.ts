/**
 * DOM Utilities for Content Script
 * Helper functions for DOM manipulation and analysis
 */

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface ElementInfo {
  element: HTMLElement;
  bounds: ElementBounds;
  visible: boolean;
  interactable: boolean;
  selector: string;
  xpath: string;
}

/**
 * DOM Utilities Class
 */
export class DOMUtils {
  /**
   * Get all interactive elements on the page
   */
  static getInteractiveElements(): HTMLElement[] {
    const selectors = [
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[onclick]',
      '[role="button"]',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ];

    const elements: HTMLElement[] = [];
    selectors.forEach(selector => {
      const found = document.querySelectorAll(selector);
      found.forEach(el => elements.push(el as HTMLElement));
    });

    return elements.filter((el, index, arr) => arr.indexOf(el) === index); // Remove duplicates
  }

  /**
   * Check if element is visible in viewport
   */
  static isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    // Check if element has dimensions
    if (rect.width === 0 || rect.height === 0) return false;
    
    // Check CSS visibility
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    
    // Check opacity
    if (parseFloat(style.opacity) === 0) return false;
    
    // Check if element is in viewport
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    return (
      rect.top < viewport.height &&
      rect.bottom > 0 &&
      rect.left < viewport.width &&
      rect.right > 0
    );
  }

  /**
   * Check if element is interactable
   */
  static isElementInteractable(element: HTMLElement): boolean {
    if (!this.isElementVisible(element)) return false;

    const style = window.getComputedStyle(element);
    if (style.pointerEvents === 'none') return false;

    // Check if element is disabled
    if ('disabled' in element && (element as any).disabled) return false;

    // Check if element is readonly
    if ('readOnly' in element && (element as any).readOnly) return false;

    // Check if element is behind another element
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(centerX, centerY);
    
    return topElement === element || element.contains(topElement);
  }

  /**
   * Generate unique CSS selector for element
   */
  static generateSelector(element: HTMLElement): string {
    // Try ID first
    if (element.id) {
      const idSelector = `#${CSS.escape(element.id)}`;
      if (document.querySelectorAll(idSelector).length === 1) {
        return idSelector;
      }
    }

    // Try unique class combination
    if (element.className) {
      const classes = element.className.split(/\\s+/).filter(c => c.trim());
      if (classes.length > 0) {
        const classSelector = '.' + classes.map(c => CSS.escape(c)).join('.');
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      }
    }

    // Try data attributes
    const dataAttrs = Array.from(element.attributes).filter(attr => 
      attr.name.startsWith('data-') && attr.value
    );
    
    for (const attr of dataAttrs) {
      const selector = `[${attr.name}="${CSS.escape(attr.value)}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }

    // Try other unique attributes
    const uniqueAttrs = ['name', 'title', 'alt', 'placeholder'];
    for (const attrName of uniqueAttrs) {
      const attrValue = element.getAttribute(attrName);
      if (attrValue) {
        const selector = `${element.tagName.toLowerCase()}[${attrName}="${CSS.escape(attrValue)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Generate path-based selector
    return this.generatePathSelector(element);
  }

  /**
   * Generate path-based CSS selector
   */
  private static generatePathSelector(element: HTMLElement): string {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      // Add nth-child if needed
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children)
          .filter(sibling => sibling.tagName === current!.tagName);
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Generate XPath for element
   */
  static generateXPath(element: HTMLElement): string {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      const part = index > 1 ? `${tagName}[${index}]` : tagName;
      path.unshift(part);

      current = current.parentElement;
    }

    return '/' + path.join('/');
  }

  /**
   * Get element bounds
   */
  static getElementBounds(element: HTMLElement): ElementBounds {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right
    };
  }

  /**
   * Get element information
   */
  static getElementInfo(element: HTMLElement): ElementInfo {
    return {
      element,
      bounds: this.getElementBounds(element),
      visible: this.isElementVisible(element),
      interactable: this.isElementInteractable(element),
      selector: this.generateSelector(element),
      xpath: this.generateXPath(element)
    };
  }

  /**
   * Find elements by text content
   */
  static findElementsByText(text: string, exact: boolean = false): HTMLElement[] {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const elements: HTMLElement[] = [];
    let node: Node | null;

    while (node = walker.nextNode()) {
      const textContent = node.textContent?.trim() || '';
      const matches = exact ? 
        textContent === text : 
        textContent.toLowerCase().includes(text.toLowerCase());

      if (matches && node.parentElement) {
        elements.push(node.parentElement);
      }
    }

    return elements;
  }

  /**
   * Find elements by placeholder text
   */
  static findElementsByPlaceholder(placeholder: string): HTMLElement[] {
    const selector = `input[placeholder*="${CSS.escape(placeholder)}" i], textarea[placeholder*="${CSS.escape(placeholder)}" i]`;
    return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
  }

  /**
   * Find elements by label text
   */
  static findElementsByLabel(labelText: string): HTMLElement[] {
    const labels = Array.from(document.querySelectorAll('label'));
    const elements: HTMLElement[] = [];

    labels.forEach(label => {
      const text = label.textContent?.trim() || '';
      if (text.toLowerCase().includes(labelText.toLowerCase())) {
        // Find associated input
        const forAttr = label.getAttribute('for');
        if (forAttr) {
          const input = document.getElementById(forAttr);
          if (input) elements.push(input as HTMLElement);
        } else {
          // Look for input inside label
          const input = label.querySelector('input, select, textarea');
          if (input) elements.push(input as HTMLElement);
        }
      }
    });

    return elements;
  }

  /**
   * Get form data from element
   */
  static getFormData(form: HTMLFormElement): Record<string, any> {
    const formData = new FormData(form);
    const data: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
      if (data[key]) {
        // Handle multiple values (checkboxes, multi-select)
        if (Array.isArray(data[key])) {
          data[key].push(value);
        } else {
          data[key] = [data[key], value];
        }
      } else {
        data[key] = value;
      }
    }

    return data;
  }

  /**
   * Scroll element into view smoothly
   */
  static scrollIntoView(element: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
    element.scrollIntoView({
      behavior,
      block: 'center',
      inline: 'center'
    });
  }

  /**
   * Wait for element to appear
   */
  static waitForElement(selector: string, timeout: number = 5000): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Wait for element to be visible
   */
  static waitForElementVisible(selector: string, timeout: number = 5000): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const checkVisibility = () => {
        const element = document.querySelector(selector) as HTMLElement;
        if (element && this.isElementVisible(element)) {
          resolve(element);
          return true;
        }
        return false;
      };

      if (checkVisibility()) return;

      const observer = new MutationObserver(() => {
        if (checkVisibility()) {
          observer.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not visible within ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Get element's computed style properties
   */
  static getElementStyles(element: HTMLElement, properties: string[]): Record<string, string> {
    const style = window.getComputedStyle(element);
    const styles: Record<string, string> = {};

    properties.forEach(prop => {
      styles[prop] = style.getPropertyValue(prop);
    });

    return styles;
  }

  /**
   * Check if element is in viewport
   */
  static isElementInViewport(element: HTMLElement, threshold: number = 0): boolean {
    const rect = element.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    const visibleWidth = Math.min(rect.right, viewport.width) - Math.max(rect.left, 0);
    const visibleHeight = Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0);
    
    const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
    const totalArea = rect.width * rect.height;
    
    return totalArea > 0 && (visibleArea / totalArea) >= threshold;
  }

  /**
   * Get element's text content without child elements
   */
  static getDirectTextContent(element: HTMLElement): string {
    const clone = element.cloneNode(true) as HTMLElement;
    const children = clone.querySelectorAll('*');
    children.forEach(child => child.remove());
    return clone.textContent?.trim() || '';
  }

  /**
   * Find closest interactive parent
   */
  static findClosestInteractive(element: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = element;
    
    while (current && current !== document.body) {
      if (this.isElementInteractable(current)) {
        return current;
      }
      current = current.parentElement;
    }
    
    return null;
  }

  /**
   * Get element hierarchy
   */
  static getElementHierarchy(element: HTMLElement): string[] {
    const hierarchy: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let descriptor = current.tagName.toLowerCase();
      
      if (current.id) {
        descriptor += `#${current.id}`;
      } else if (current.className) {
        const classes = current.className.split(/\\s+/).filter(c => c.trim());
        if (classes.length > 0) {
          descriptor += `.${classes.join('.')}`;
        }
      }
      
      hierarchy.unshift(descriptor);
      current = current.parentElement;
    }

    return hierarchy;
  }
}