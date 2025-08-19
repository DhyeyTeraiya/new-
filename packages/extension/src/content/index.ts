/**
 * Browser AI Agent Content Script
 * This script runs on all web pages and provides the interface between the page and the extension
 */

import { PageContext, ElementInfo, PageMetadata, ViewportInfo } from '@browser-ai-agent/shared';
import { WidgetManager } from '../widget/widget-manager';

class ContentScript {
  private isInitialized: boolean = false;
  private widgetManager: WidgetManager;
  private automationMode: boolean = false;
  private observedElements: Set<Element> = new Set();
  private mutationObserver: MutationObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  constructor() {
    this.widgetManager = new WidgetManager();
    this.init();
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;

    console.log('Browser AI Agent: Content script initializing...');

    // Setup message listeners
    this.setupMessageListeners();

    // Initialize widget
    try {
      await this.widgetManager.initialize();
      console.log('Browser AI Agent: Widget initialized');
    } catch (error) {
      console.error('Browser AI Agent: Failed to initialize widget:', error);
    }

    // Notify background script that content script is ready
    this.sendMessageToBackground({
      type: 'CONTENT_SCRIPT_READY',
      data: {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now()
      }
    });

    this.isInitialized = true;
    console.log('Browser AI Agent: Content script initialized');
  }

  private setupMessageListeners(): void {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Listen for page navigation
    window.addEventListener('beforeunload', () => {
      this.sendMessageToBackground({
        type: 'PAGE_UNLOAD',
        data: { url: window.location.href }
      });
    });

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.sendMessageToBackground({
        type: 'PAGE_VISIBILITY_CHANGE',
        data: {
          visible: !document.hidden,
          url: window.location.href
        }
      });
    });

    // Setup DOM observers
    this.setupDOMObservers();
  }

  private async handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'GET_PAGE_CONTEXT':
          const context = await this.getPageContext();
          sendResponse({ success: true, data: context });
          break;

        case 'OPEN_CHAT_WIDGET':
          this.widgetManager.show();
          sendResponse({ success: true });
          break;

        case 'START_AUTOMATION_MODE':
          this.startAutomationMode();
          sendResponse({ success: true });
          break;

        case 'STOP_AUTOMATION_MODE':
          this.stopAutomationMode();
          sendResponse({ success: true });
          break;

        case 'HIGHLIGHT_ELEMENT':
          this.highlightElement(message.data.selector);
          sendResponse({ success: true });
          break;

        case 'EXECUTE_ACTION':
          const result = await this.executeAction(message.data);
          sendResponse({ success: true, data: result });
          break;

        case 'ANALYZE_ELEMENT':
          const analysis = await this.analyzeElement(message.data.selector);
          sendResponse({ success: true, data: analysis });
          break;

        case 'EXTRACT_DATA':
          const extractedData = await this.extractData(message.data);
          sendResponse({ success: true, data: extractedData });
          break;

        case 'SIMULATE_USER_INTERACTION':
          const simulationResult = await this.simulateUserInteraction(message.data);
          sendResponse({ success: true, data: simulationResult });
          break;

        case 'TAKE_SCREENSHOT':
          // This will be handled by background script
          sendResponse({ success: true, message: 'Screenshot handled by background script' });
          break;

        case 'WEBSOCKET_MESSAGE':
          this.handleWebSocketMessage(message.data);
          this.widgetManager.handleWebSocketMessage(message.data);
          sendResponse({ success: true });
          break;

        case 'PAGE_LOADED':
          // Handle page load notification from background
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Content script message handler error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Extract page context for AI analysis
   */
  private async getPageContext(): Promise<PageContext> {
    const context: PageContext = {
      url: window.location.href,
      title: document.title,
      content: this.extractPageContent(),
      elements: this.extractInteractiveElements(),
      metadata: this.extractMetadata(),
      screenshot: null, // Will be captured by background script
      timestamp: new Date(),
      viewport: this.getViewportInfo()
    };

    return context;
  }

  /**
   * Extract main page content
   */
  private extractPageContent(): string {
    // Remove script and style elements
    const clone = document.cloneNode(true) as Document;
    const scripts = clone.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());

    // Get main content areas
    const contentSelectors = [
      'main',
      '[role=\"main\"]',
      '.main-content',
      '#main-content',
      '.content',
      '#content',
      'article',
      '.article'
    ];

    let content = '';
    for (const selector of contentSelectors) {
      const element = clone.querySelector(selector);
      if (element) {
        content = element.textContent?.trim() || '';
        if (content.length > 100) break;
      }
    }

    // Fallback to body content if no main content found
    if (!content) {
      content = clone.body?.textContent?.trim() || '';
    }

    // Limit content length and clean up
    return content.substring(0, 5000).replace(/\\s+/g, ' ').trim();
  }

  /**
   * Extract interactive elements
   */
  private extractInteractiveElements(): ElementInfo[] {
    const elements: ElementInfo[] = [];

    // Interactive element selectors
    const interactiveSelectors = [
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[onclick]',
      '[role="button"]',
      '[tabindex]'
    ];

    interactiveSelectors.forEach(selector => {
      const els = document.querySelectorAll(selector);
      els.forEach((el, index) => {
        if (this.isElementVisible(el as HTMLElement)) {
          const element = el as HTMLElement;
          const bounds = element.getBoundingClientRect();
          const elementSelector = this.generateSelector(element, index);
          const xpath = this.generateXPath(element);
          
          elements.push({
            id: element.id || `element_${index}`,
            tagName: element.tagName.toLowerCase(),
            type: element.getAttribute('type') || element.tagName.toLowerCase(),
            selector: elementSelector,
            xpath: xpath,
            text: (element.textContent || '').trim().substring(0, 100),
            attributes: this.getElementAttributes(element),
            bounds: {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height
            },
            visible: this.isElementVisible(element),
            interactable: this.isElementInteractable(element)
          });
        }
      });
    });

    return elements.slice(0, 50); // Limit to 50 elements
  }

  /**
   * Extract page metadata
   */
  private extractMetadata(): PageMetadata {
    const metaTags: Record<string, string> = {};

    // Meta tags
    const metaElements = document.querySelectorAll('meta');
    metaElements.forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) {
        metaTags[name] = content;
      }
    });

    // Check for forms and interactive elements
    const hasForms = document.querySelectorAll('form').length > 0;
    const hasInteractiveElements = document.querySelectorAll('button, input, select, textarea, [onclick], [role="button"]').length > 0;

    const metadata: PageMetadata = {
      title: document.title,
      description: metaTags['description'] || '',
      keywords: metaTags['keywords'] || '',
      author: metaTags['author'] || '',
      lang: document.documentElement.lang || 'en',
      charset: document.characterSet,
      loadingState: document.readyState,
      hasForms,
      hasInteractiveElements,
      metaTags
    };

    return metadata;
  }

  /**
   * Check if element is visible
   */
  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0'
    );
  }

  /**
   * Generate CSS selector for element
   */
  private generateSelector(element: HTMLElement, index: number): string {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Try unique class combination
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        const classSelector = '.' + classes.join('.');
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
      const selector = `[${attr.name}=\"${attr.value}\"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }

    // Fallback to tag with index
    const tagName = element.tagName.toLowerCase();
    return `${tagName}:nth-of-type(${index + 1})`;
  }

  /**
   * Get element attributes
   */
  private getElementAttributes(element: HTMLElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    const importantAttrs = ['id', 'class', 'type', 'name', 'value', 'href', 'src', 'alt', 'title'];
    
    importantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    });

    return attributes;
  }

  /**
   * Highlight element on page
   */
  private highlightElement(selector: string): void {
    // Remove existing highlights
    document.querySelectorAll('.ai-agent-highlight').forEach(el => {
      el.classList.remove('ai-agent-highlight');
    });

    // Add highlight to target element
    const element = document.querySelector(selector);
    if (element) {
      element.classList.add('ai-agent-highlight');
      
      // Add highlight styles if not already present
      if (!document.getElementById('ai-agent-highlight-styles')) {
        const style = document.createElement('style');
        style.id = 'ai-agent-highlight-styles';
        style.textContent = `
          .ai-agent-highlight {
            outline: 3px solid #3b82f6 !important;
            outline-offset: 2px !important;
            background-color: rgba(59, 130, 246, 0.1) !important;
            transition: all 0.3s ease !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Remove highlight after 3 seconds
      setTimeout(() => {
        element.classList.remove('ai-agent-highlight');
      }, 3000);
    }
  }

  /**
   * Execute action on page
   */
  private async executeAction(actionData: any): Promise<any> {
    const { type, selector, value } = actionData;

    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    switch (type) {
      case 'click':
        element.click();
        return { success: true, action: 'click', selector };

      case 'type':
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.focus();
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return { success: true, action: 'type', selector, value };

      case 'scroll':
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { success: true, action: 'scroll', selector };

      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(message: any): void {
    console.log('Content script received WebSocket message:', message);
    
    // Handle different message types
    switch (message.type) {
      case 'ai_response':
        // TODO: Display AI response in chat widget (task 8)
        break;
        
      case 'automation_command':
        // TODO: Execute automation command (task 9)
        break;
        
      case 'page_analysis':
        // TODO: Handle page analysis results
        break;
    }
  }

  /**
   * Get viewport information
   */
  private getViewportInfo(): ViewportInfo {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio
    };
  }

  /**
   * Generate XPath for element
   */
  private generateXPath(element: HTMLElement): string {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts: string[] = [];
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
      parts.unshift(part);

      current = current.parentElement;
    }

    return '/' + parts.join('/');
  }

  /**
   * Check if element is interactable
   */
  private isElementInteractable(element: HTMLElement): boolean {
    if (!this.isElementVisible(element)) return false;

    const style = window.getComputedStyle(element);
    if (style.pointerEvents === 'none') return false;

    // Check if element is disabled
    if (element instanceof HTMLInputElement || 
        element instanceof HTMLButtonElement || 
        element instanceof HTMLSelectElement || 
        element instanceof HTMLTextAreaElement) {
      if (element.disabled) return false;
    }

    // Check if element is readonly
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.readOnly) return false;
    }

    return true;
  }

  /**
   * Setup DOM observers for dynamic content
   */
  private setupDOMObservers(): void {
    // Mutation observer for DOM changes
    this.mutationObserver = new MutationObserver((mutations) => {
      this.handleDOMChanges(mutations);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'readonly']
    });

    // Intersection observer for element visibility
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.handleVisibilityChanges(entries);
    }, {
      threshold: [0, 0.5, 1]
    });
  }

  /**
   * Handle DOM changes
   */
  private handleDOMChanges(mutations: MutationRecord[]): void {
    let hasSignificantChanges = false;

    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (this.isInteractiveElement(element)) {
              hasSignificantChanges = true;
              this.observedElements.add(element);
              if (this.intersectionObserver) {
                this.intersectionObserver.observe(element);
              }
            }
          }
        });

        mutation.removedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            this.observedElements.delete(element);
            if (this.intersectionObserver) {
              this.intersectionObserver.unobserve(element);
            }
          }
        });
      }
    });

    if (hasSignificantChanges && this.automationMode) {
      this.notifyDOMChanges();
    }
  }

  /**
   * Handle visibility changes
   */
  private handleVisibilityChanges(entries: IntersectionObserverEntry[]): void {
    if (this.automationMode) {
      const visibilityChanges = entries.map(entry => ({
        element: this.generateSelector(entry.target as HTMLElement, 0),
        visible: entry.isIntersecting,
        ratio: entry.intersectionRatio
      }));

      this.sendMessageToBackground({
        type: 'ELEMENT_VISIBILITY_CHANGED',
        data: { changes: visibilityChanges }
      });
    }
  }

  /**
   * Check if element is interactive
   */
  private isInteractiveElement(element: Element): boolean {
    const interactiveTags = ['button', 'input', 'select', 'textarea', 'a'];
    const tagName = element.tagName.toLowerCase();
    
    return interactiveTags.includes(tagName) || 
           element.hasAttribute('onclick') || 
           element.getAttribute('role') === 'button' ||
           element.hasAttribute('tabindex');
  }

  /**
   * Start automation mode
   */
  private startAutomationMode(): void {
    this.automationMode = true;
    
    // Add automation overlay
    this.addAutomationOverlay();
    
    // Start observing all interactive elements
    const interactiveElements = document.querySelectorAll('button, input, select, textarea, a[href], [onclick], [role="button"]');
    interactiveElements.forEach(element => {
      this.observedElements.add(element);
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(element);
      }
    });

    // Notify background script
    this.sendMessageToBackground({
      type: 'AUTOMATION_MODE_STARTED',
      data: { timestamp: Date.now() }
    });

    console.log('Browser AI Agent: Automation mode started');
  }

  /**
   * Stop automation mode
   */
  private stopAutomationMode(): void {
    this.automationMode = false;
    
    // Remove automation overlay
    this.removeAutomationOverlay();
    
    // Stop observing elements
    if (this.intersectionObserver) {
      this.observedElements.forEach(element => {
        this.intersectionObserver!.unobserve(element);
      });
    }
    this.observedElements.clear();

    // Notify background script
    this.sendMessageToBackground({
      type: 'AUTOMATION_MODE_STOPPED',
      data: { timestamp: Date.now() }
    });

    console.log('Browser AI Agent: Automation mode stopped');
  }

  /**
   * Add automation overlay
   */
  private addAutomationOverlay(): void {
    if (document.getElementById('ai-agent-automation-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ai-agent-automation-overlay';
    overlay.className = 'ai-agent-automation-overlay';
    overlay.innerHTML = `
      <div style="position: fixed; top: 20px; left: 20px; background: rgba(0,0,0,0.8); color: white; padding: 12px 16px; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; z-index: 2147483647;">
        🤖 AI Automation Mode Active
        <button onclick="this.parentElement.parentElement.remove()" style="margin-left: 12px; background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button>
      </div>
    `;
    
    document.body.appendChild(overlay);
  }

  /**
   * Remove automation overlay
   */
  private removeAutomationOverlay(): void {
    const overlay = document.getElementById('ai-agent-automation-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Notify about DOM changes
   */
  private notifyDOMChanges(): void {
    this.sendMessageToBackground({
      type: 'DOM_CHANGES_DETECTED',
      data: {
        timestamp: Date.now(),
        url: window.location.href,
        elementCount: this.observedElements.size
      }
    });
  }

  /**
   * Analyze specific element
   */
  private async analyzeElement(selector: string): Promise<any> {
    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const bounds = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return {
      selector,
      tagName: element.tagName.toLowerCase(),
      text: element.textContent?.trim() || '',
      attributes: this.getElementAttributes(element),
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      },
      style: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily
      },
      visible: this.isElementVisible(element),
      interactable: this.isElementInteractable(element),
      xpath: this.generateXPath(element),
      parent: element.parentElement ? this.generateSelector(element.parentElement, 0) : null,
      children: Array.from(element.children).map(child => 
        this.generateSelector(child as HTMLElement, 0)
      ).slice(0, 10)
    };
  }

  /**
   * Extract data from page or specific elements
   */
  private async extractData(options: any): Promise<any> {
    const { type, selectors, format } = options;

    switch (type) {
      case 'table':
        return this.extractTableData(selectors);
      case 'form':
        return this.extractFormData(selectors);
      case 'list':
        return this.extractListData(selectors);
      case 'text':
        return this.extractTextData(selectors);
      case 'links':
        return this.extractLinkData(selectors);
      case 'images':
        return this.extractImageData(selectors);
      default:
        return this.extractGenericData(selectors);
    }
  }

  /**
   * Extract table data
   */
  private extractTableData(selectors?: string[]): any[] {
    const tables = selectors ? 
      selectors.map(s => document.querySelector(s)).filter(Boolean) :
      Array.from(document.querySelectorAll('table'));

    return tables.map(table => {
      const rows = Array.from(table!.querySelectorAll('tr'));
      const headers = Array.from(rows[0]?.querySelectorAll('th, td') || [])
        .map(cell => cell.textContent?.trim() || '');
      
      const data = rows.slice(1).map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const rowData: Record<string, string> = {};
        
        cells.forEach((cell, index) => {
          const header = headers[index] || `column_${index}`;
          rowData[header] = cell.textContent?.trim() || '';
        });
        
        return rowData;
      });

      return { headers, data };
    });
  }

  /**
   * Extract form data
   */
  private extractFormData(selectors?: string[]): any[] {
    const forms = selectors ?
      selectors.map(s => document.querySelector(s)).filter(Boolean) :
      Array.from(document.querySelectorAll('form'));

    return forms.map(form => {
      const formData: Record<string, any> = {};
      const inputs = form!.querySelectorAll('input, select, textarea');
      
      inputs.forEach(input => {
        const element = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const name = element.name || element.id || `field_${Math.random().toString(36).substr(2, 9)}`;
        
        if (element instanceof HTMLInputElement) {
          if (element.type === 'checkbox' || element.type === 'radio') {
            formData[name] = element.checked;
          } else {
            formData[name] = element.value;
          }
        } else {
          formData[name] = element.value;
        }
      });

      return {
        action: (form as HTMLFormElement).action,
        method: (form as HTMLFormElement).method,
        data: formData
      };
    });
  }

  /**
   * Extract list data
   */
  private extractListData(selectors?: string[]): any[] {
    const lists = selectors ?
      selectors.map(s => document.querySelector(s)).filter(Boolean) :
      Array.from(document.querySelectorAll('ul, ol'));

    return lists.map(list => {
      const items = Array.from(list!.querySelectorAll('li'));
      return items.map(item => ({
        text: item.textContent?.trim() || '',
        html: item.innerHTML,
        links: Array.from(item.querySelectorAll('a')).map(a => ({
          text: a.textContent?.trim() || '',
          href: a.href
        }))
      }));
    });
  }

  /**
   * Extract text data
   */
  private extractTextData(selectors?: string[]): any[] {
    const elements = selectors ?
      selectors.map(s => document.querySelector(s)).filter(Boolean) :
      Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div'));

    return elements.map(element => ({
      selector: this.generateSelector(element as HTMLElement, 0),
      text: element!.textContent?.trim() || '',
      tagName: element!.tagName.toLowerCase(),
      className: (element as HTMLElement).className,
      id: (element as HTMLElement).id
    }));
  }

  /**
   * Extract link data
   */
  private extractLinkData(selectors?: string[]): any[] {
    const links = selectors ?
      selectors.map(s => document.querySelector(s)).filter(Boolean) :
      Array.from(document.querySelectorAll('a[href]'));

    return links.map(link => {
      const a = link as HTMLAnchorElement;
      return {
        text: a.textContent?.trim() || '',
        href: a.href,
        title: a.title,
        target: a.target,
        rel: a.rel,
        download: a.download
      };
    });
  }

  /**
   * Extract image data
   */
  private extractImageData(selectors?: string[]): any[] {
    const images = selectors ?
      selectors.map(s => document.querySelector(s)).filter(Boolean) :
      Array.from(document.querySelectorAll('img'));

    return images.map(img => {
      const image = img as HTMLImageElement;
      return {
        src: image.src,
        alt: image.alt,
        title: image.title,
        width: image.width,
        height: image.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      };
    });
  }

  /**
   * Extract generic data
   */
  private extractGenericData(selectors: string[]): any[] {
    return selectors.map(selector => {
      const elements = Array.from(document.querySelectorAll(selector));
      return elements.map(element => ({
        selector,
        text: element.textContent?.trim() || '',
        html: element.innerHTML,
        attributes: this.getElementAttributes(element as HTMLElement),
        bounds: element.getBoundingClientRect()
      }));
    }).flat();
  }

  /**
   * Simulate user interaction
   */
  private async simulateUserInteraction(options: any): Promise<any> {
    const { type, selector, value, delay = 100 } = options;
    
    const element = document.querySelector(selector) as HTMLElement;
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Scroll element into view first
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(delay);

    // Highlight element
    this.highlightElement(selector);
    await this.sleep(delay);

    switch (type) {
      case 'hover':
        return this.simulateHover(element);
      case 'focus':
        return this.simulateFocus(element);
      case 'click':
        return this.simulateClick(element);
      case 'doubleClick':
        return this.simulateDoubleClick(element);
      case 'rightClick':
        return this.simulateRightClick(element);
      case 'type':
        return this.simulateTyping(element, value, delay);
      case 'keyPress':
        return this.simulateKeyPress(element, value);
      case 'drag':
        return this.simulateDrag(element, value);
      default:
        throw new Error(`Unknown interaction type: ${type}`);
    }
  }

  /**
   * Simulate hover
   */
  private simulateHover(element: HTMLElement): any {
    const events = ['mouseenter', 'mouseover'];
    events.forEach(eventType => {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    });

    return { success: true, action: 'hover' };
  }

  /**
   * Simulate focus
   */
  private simulateFocus(element: HTMLElement): any {
    if (element instanceof HTMLInputElement || 
        element instanceof HTMLTextAreaElement || 
        element instanceof HTMLSelectElement) {
      element.focus();
    }

    const event = new FocusEvent('focus', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(event);

    return { success: true, action: 'focus' };
  }

  /**
   * Simulate click
   */
  private simulateClick(element: HTMLElement): any {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const events = ['mousedown', 'mouseup', 'click'];
    events.forEach(eventType => {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
      });
      element.dispatchEvent(event);
    });

    return { success: true, action: 'click', coordinates: { x, y } };
  }

  /**
   * Simulate double click
   */
  private simulateDoubleClick(element: HTMLElement): any {
    this.simulateClick(element);
    
    setTimeout(() => {
      const event = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    }, 10);

    return { success: true, action: 'doubleClick' };
  }

  /**
   * Simulate right click
   */
  private simulateRightClick(element: HTMLElement): any {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2
    });
    element.dispatchEvent(event);

    return { success: true, action: 'rightClick' };
  }

  /**
   * Simulate typing
   */
  private async simulateTyping(element: HTMLElement, text: string, delay: number): Promise<any> {
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
      throw new Error('Element is not a text input');
    }

    element.focus();
    element.value = '';

    for (const char of text) {
      element.value += char;
      
      // Dispatch input events
      const inputEvent = new Event('input', { bubbles: true });
      element.dispatchEvent(inputEvent);
      
      const keyEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        key: char,
        char: char
      });
      element.dispatchEvent(keyEvent);

      await this.sleep(delay);
    }

    // Dispatch change event
    const changeEvent = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvent);

    return { success: true, action: 'type', text };
  }

  /**
   * Simulate key press
   */
  private simulateKeyPress(element: HTMLElement, key: string): any {
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      key: key,
      code: key
    });
    element.dispatchEvent(keyEvent);

    const keyUpEvent = new KeyboardEvent('keyup', {
      bubbles: true,
      key: key,
      code: key
    });
    element.dispatchEvent(keyUpEvent);

    return { success: true, action: 'keyPress', key };
  }

  /**
   * Simulate drag
   */
  private simulateDrag(element: HTMLElement, target: any): any {
    const { x, y } = target;
    const rect = element.getBoundingClientRect();
    
    const dragStartEvent = new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(dragStartEvent);

    const dragEvent = new DragEvent('drag', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y
    });
    element.dispatchEvent(dragEvent);

    const dragEndEvent = new DragEvent('dragend', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y
    });
    element.dispatchEvent(dragEndEvent);

    return { success: true, action: 'drag', from: rect, to: { x, y } };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send message to background script
   */
  private sendMessageToBackground(message: any): void {
    chrome.runtime.sendMessage(message).catch((error: any) => {
      console.error('Failed to send message to background:', error);
    });
  }

  /**
   * Cleanup observers on destroy
   */
  public destroy(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    this.observedElements.clear();
    this.stopAutomationMode();
  }
}

// Initialize content script
new ContentScript();