/**
 * Automation Helper
 * Advanced automation capabilities for content script
 */

import { DOMUtils } from './dom-utils';

export interface AutomationAction {
  type: 'click' | 'type' | 'select' | 'hover' | 'scroll' | 'wait' | 'extract' | 'verify';
  selector?: string;
  value?: any;
  options?: Record<string, any>;
}

export interface AutomationResult {
  success: boolean;
  action: string;
  data?: any;
  error?: string;
  timestamp: number;
}

/**
 * Automation Helper Class
 */
export class AutomationHelper {
  private static instance: AutomationHelper;
  private isRecording: boolean = false;
  private recordedActions: AutomationAction[] = [];
  private actionHistory: AutomationResult[] = [];

  static getInstance(): AutomationHelper {
    if (!AutomationHelper.instance) {
      AutomationHelper.instance = new AutomationHelper();
    }
    return AutomationHelper.instance;
  }

  /**
   * Execute a single automation action
   */
  async executeAction(action: AutomationAction): Promise<AutomationResult> {
    const startTime = Date.now();
    
    try {
      let result: any;

      switch (action.type) {
        case 'click':
          result = await this.performClick(action);
          break;
        case 'type':
          result = await this.performType(action);
          break;
        case 'select':
          result = await this.performSelect(action);
          break;
        case 'hover':
          result = await this.performHover(action);
          break;
        case 'scroll':
          result = await this.performScroll(action);
          break;
        case 'wait':
          result = await this.performWait(action);
          break;
        case 'extract':
          result = await this.performExtract(action);
          break;
        case 'verify':
          result = await this.performVerify(action);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      const automationResult: AutomationResult = {
        success: true,
        action: action.type,
        data: result,
        timestamp: Date.now() - startTime
      };

      this.actionHistory.push(automationResult);
      return automationResult;

    } catch (error) {
      const automationResult: AutomationResult = {
        success: false,
        action: action.type,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now() - startTime
      };

      this.actionHistory.push(automationResult);
      return automationResult;
    }
  }

  /**
   * Execute multiple automation actions in sequence
   */
  async executeSequence(actions: AutomationAction[]): Promise<AutomationResult[]> {
    const results: AutomationResult[] = [];

    for (const action of actions) {
      const result = await this.executeAction(action);
      results.push(result);

      // Stop execution if action failed and no error handling specified
      if (!result.success && !action.options?.continueOnError) {
        break;
      }

      // Add delay between actions if specified
      if (action.options?.delay) {
        await this.sleep(action.options.delay);
      }
    }

    return results;
  }

  /**
   * Perform click action
   */
  private async performClick(action: AutomationAction): Promise<any> {
    if (!action.selector) throw new Error('Selector required for click action');

    const element = await this.findElement(action.selector, action.options?.timeout);
    
    // Scroll element into view
    DOMUtils.scrollIntoView(element);
    await this.sleep(100);

    // Ensure element is interactable
    if (!DOMUtils.isElementInteractable(element)) {
      throw new Error(`Element ${action.selector} is not interactable`);
    }

    // Perform click with realistic timing
    await this.simulateHumanClick(element, action.options);

    return {
      selector: action.selector,
      elementText: element.textContent?.trim() || '',
      elementType: element.tagName.toLowerCase()
    };
  }

  /**
   * Perform type action
   */
  private async performType(action: AutomationAction): Promise<any> {
    if (!action.selector) throw new Error('Selector required for type action');
    if (action.value === undefined) throw new Error('Value required for type action');

    const element = await this.findElement(action.selector, action.options?.timeout);
    
    if (!(element instanceof HTMLInputElement) && 
        !(element instanceof HTMLTextAreaElement) &&
        !element.isContentEditable) {
      throw new Error(`Element ${action.selector} is not a text input`);
    }

    // Focus element
    element.focus();
    await this.sleep(100);

    // Clear existing content if specified
    if (action.options?.clear !== false) {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = '';
      } else if (element.isContentEditable) {
        element.textContent = '';
      }
    }

    // Type text with human-like timing
    await this.simulateHumanTyping(element, action.value.toString(), action.options);

    return {
      selector: action.selector,
      value: action.value,
      finalValue: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? 
        element.value : element.textContent
    };
  }

  /**
   * Perform select action
   */
  private async performSelect(action: AutomationAction): Promise<any> {
    if (!action.selector) throw new Error('Selector required for select action');
    if (action.value === undefined) throw new Error('Value required for select action');

    const element = await this.findElement(action.selector, action.options?.timeout);
    
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error(`Element ${action.selector} is not a select element`);
    }

    // Select by value, text, or index
    const selectBy = action.options?.selectBy || 'value';
    let optionSelected = false;

    switch (selectBy) {
      case 'value':
        element.value = action.value.toString();
        optionSelected = element.value === action.value.toString();
        break;
      
      case 'text':
        const options = Array.from(element.options);
        const option = options.find(opt => 
          opt.textContent?.trim().toLowerCase() === action.value.toString().toLowerCase()
        );
        if (option) {
          element.selectedIndex = option.index;
          optionSelected = true;
        }
        break;
      
      case 'index':
        const index = parseInt(action.value.toString());
        if (index >= 0 && index < element.options.length) {
          element.selectedIndex = index;
          optionSelected = true;
        }
        break;
    }

    if (!optionSelected) {
      throw new Error(`Could not select option ${action.value} in ${action.selector}`);
    }

    // Trigger change event
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      selector: action.selector,
      selectedValue: element.value,
      selectedText: element.options[element.selectedIndex]?.textContent?.trim() || '',
      selectedIndex: element.selectedIndex
    };
  }

  /**
   * Perform hover action
   */
  private async performHover(action: AutomationAction): Promise<any> {
    if (!action.selector) throw new Error('Selector required for hover action');

    const element = await this.findElement(action.selector, action.options?.timeout);
    
    // Scroll element into view
    DOMUtils.scrollIntoView(element);
    await this.sleep(100);

    // Simulate mouse hover
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const events = ['mouseenter', 'mouseover', 'mousemove'];
    for (const eventType of events) {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
      });
      element.dispatchEvent(event);
      await this.sleep(50);
    }

    return {
      selector: action.selector,
      coordinates: { x, y }
    };
  }

  /**
   * Perform scroll action
   */
  private async performScroll(action: AutomationAction): Promise<any> {
    const options = action.options || {};
    
    if (action.selector) {
      // Scroll to element
      const element = await this.findElement(action.selector, options.timeout);
      DOMUtils.scrollIntoView(element, options.behavior || 'smooth');
      
      return {
        selector: action.selector,
        scrolledToElement: true
      };
    } else {
      // Scroll by amount or to position
      const x = options.x || window.scrollX;
      const y = options.y || window.scrollY;
      
      if (options.by) {
        // Scroll by relative amount
        window.scrollBy({
          left: options.by.x || 0,
          top: options.by.y || 0,
          behavior: options.behavior || 'smooth'
        });
      } else {
        // Scroll to absolute position
        window.scrollTo({
          left: x,
          top: y,
          behavior: options.behavior || 'smooth'
        });
      }

      return {
        scrollPosition: { x: window.scrollX, y: window.scrollY }
      };
    }
  }

  /**
   * Perform wait action
   */
  private async performWait(action: AutomationAction): Promise<any> {
    const options = action.options || {};
    
    if (options.forElement) {
      // Wait for element to appear
      await DOMUtils.waitForElement(options.forElement, options.timeout || 5000);
      return { waitedForElement: options.forElement };
    } else if (options.forVisible) {
      // Wait for element to be visible
      await DOMUtils.waitForElementVisible(options.forVisible, options.timeout || 5000);
      return { waitedForVisible: options.forVisible };
    } else {
      // Wait for specified time
      const duration = action.value || options.duration || 1000;
      await this.sleep(duration);
      return { waitedFor: duration };
    }
  }

  /**
   * Perform extract action
   */
  private async performExtract(action: AutomationAction): Promise<any> {
    const options = action.options || {};
    
    if (action.selector) {
      const element = await this.findElement(action.selector, options.timeout);
      
      return {
        selector: action.selector,
        text: element.textContent?.trim() || '',
        html: element.innerHTML,
        attributes: this.getElementAttributes(element),
        bounds: DOMUtils.getElementBounds(element)
      };
    } else {
      // Extract page-level data
      return {
        title: document.title,
        url: window.location.href,
        content: document.body.textContent?.trim() || '',
        links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent?.trim() || '',
          href: (a as HTMLAnchorElement).href
        }))
      };
    }
  }

  /**
   * Perform verify action
   */
  private async performVerify(action: AutomationAction): Promise<any> {
    const options = action.options || {};
    
    if (!action.selector) throw new Error('Selector required for verify action');
    
    const element = await this.findElement(action.selector, options.timeout);
    const verifications: Record<string, boolean> = {};

    // Verify text content
    if (options.text !== undefined) {
      const elementText = element.textContent?.trim() || '';
      verifications.text = options.exactMatch ? 
        elementText === options.text :
        elementText.includes(options.text);
    }

    // Verify visibility
    if (options.visible !== undefined) {
      verifications.visible = DOMUtils.isElementVisible(element) === options.visible;
    }

    // Verify attributes
    if (options.attributes) {
      for (const [attr, expectedValue] of Object.entries(options.attributes)) {
        const actualValue = element.getAttribute(attr);
        verifications[`attribute_${attr}`] = actualValue === expectedValue;
      }
    }

    // Verify CSS properties
    if (options.styles) {
      const computedStyle = window.getComputedStyle(element);
      for (const [prop, expectedValue] of Object.entries(options.styles)) {
        const actualValue = computedStyle.getPropertyValue(prop);
        verifications[`style_${prop}`] = actualValue === expectedValue;
      }
    }

    const allPassed = Object.values(verifications).every(result => result);

    return {
      selector: action.selector,
      verifications,
      allPassed,
      element: {
        text: element.textContent?.trim() || '',
        visible: DOMUtils.isElementVisible(element),
        attributes: this.getElementAttributes(element)
      }
    };
  }

  /**
   * Find element with retry logic
   */
  private async findElement(selector: string, timeout: number = 5000): Promise<HTMLElement> {
    const element = document.querySelector(selector) as HTMLElement;
    
    if (element) {
      return element;
    }

    // Wait for element to appear
    return DOMUtils.waitForElement(selector, timeout);
  }

  /**
   * Simulate human-like click
   */
  private async simulateHumanClick(element: HTMLElement, options: any = {}): Promise<void> {
    const rect = element.getBoundingClientRect();
    
    // Add some randomness to click position
    const offsetX = (Math.random() - 0.5) * Math.min(rect.width * 0.3, 10);
    const offsetY = (Math.random() - 0.5) * Math.min(rect.height * 0.3, 10);
    
    const x = rect.left + rect.width / 2 + offsetX;
    const y = rect.top + rect.height / 2 + offsetY;

    // Simulate mouse events with realistic timing
    const events = [
      { type: 'mousedown', delay: 0 },
      { type: 'mouseup', delay: 50 + Math.random() * 50 },
      { type: 'click', delay: 10 }
    ];

    for (const { type, delay } of events) {
      await this.sleep(delay);
      
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0
      });
      
      element.dispatchEvent(event);
    }
  }

  /**
   * Simulate human-like typing
   */
  private async simulateHumanTyping(element: HTMLElement, text: string, options: any = {}): Promise<void> {
    const baseDelay = options.typingSpeed || 100;
    const variation = options.typingVariation || 50;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Add character to input
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value += char;
      } else if (element.isContentEditable) {
        element.textContent = (element.textContent || '') + char;
      }

      // Dispatch events
      const keydownEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        key: char,
        char: char
      });
      element.dispatchEvent(keydownEvent);

      const inputEvent = new Event('input', { bubbles: true });
      element.dispatchEvent(inputEvent);

      const keyupEvent = new KeyboardEvent('keyup', {
        bubbles: true,
        key: char,
        char: char
      });
      element.dispatchEvent(keyupEvent);

      // Human-like delay with variation
      const delay = baseDelay + (Math.random() - 0.5) * variation;
      await this.sleep(Math.max(10, delay));
    }

    // Dispatch final change event
    const changeEvent = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvent);
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
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start recording user actions
   */
  startRecording(): void {
    this.isRecording = true;
    this.recordedActions = [];
    
    // Add event listeners for recording
    this.setupRecordingListeners();
  }

  /**
   * Stop recording user actions
   */
  stopRecording(): AutomationAction[] {
    this.isRecording = false;
    this.removeRecordingListeners();
    
    return [...this.recordedActions];
  }

  /**
   * Setup recording event listeners
   */
  private setupRecordingListeners(): void {
    // Implementation would add event listeners to record user interactions
    // This is a simplified version
    document.addEventListener('click', this.recordClick.bind(this), true);
    document.addEventListener('input', this.recordInput.bind(this), true);
    document.addEventListener('change', this.recordChange.bind(this), true);
  }

  /**
   * Remove recording event listeners
   */
  private removeRecordingListeners(): void {
    document.removeEventListener('click', this.recordClick.bind(this), true);
    document.removeEventListener('input', this.recordInput.bind(this), true);
    document.removeEventListener('change', this.recordChange.bind(this), true);
  }

  /**
   * Record click event
   */
  private recordClick(event: MouseEvent): void {
    if (!this.isRecording) return;
    
    const target = event.target as HTMLElement;
    const selector = DOMUtils.generateSelector(target);
    
    this.recordedActions.push({
      type: 'click',
      selector,
      options: {
        timestamp: Date.now(),
        coordinates: { x: event.clientX, y: event.clientY }
      }
    });
  }

  /**
   * Record input event
   */
  private recordInput(event: Event): void {
    if (!this.isRecording) return;
    
    const target = event.target as HTMLInputElement;
    const selector = DOMUtils.generateSelector(target);
    
    this.recordedActions.push({
      type: 'type',
      selector,
      value: target.value,
      options: {
        timestamp: Date.now()
      }
    });
  }

  /**
   * Record change event
   */
  private recordChange(event: Event): void {
    if (!this.isRecording) return;
    
    const target = event.target as HTMLElement;
    
    if (target instanceof HTMLSelectElement) {
      const selector = DOMUtils.generateSelector(target);
      
      this.recordedActions.push({
        type: 'select',
        selector,
        value: target.value,
        options: {
          timestamp: Date.now(),
          selectedText: target.options[target.selectedIndex]?.textContent?.trim() || ''
        }
      });
    }
  }

  /**
   * Get action history
   */
  getActionHistory(): AutomationResult[] {
    return [...this.actionHistory];
  }

  /**
   * Clear action history
   */
  clearActionHistory(): void {
    this.actionHistory = [];
  }

  /**
   * Export recorded actions
   */
  exportActions(format: 'json' | 'javascript' = 'json'): string {
    if (format === 'javascript') {
      return this.generateJavaScriptCode(this.recordedActions);
    }
    
    return JSON.stringify(this.recordedActions, null, 2);
  }

  /**
   * Generate JavaScript code from actions
   */
  private generateJavaScriptCode(actions: AutomationAction[]): string {
    const lines = [
      '// Generated automation script',
      'async function runAutomation() {',
      '  const helper = AutomationHelper.getInstance();',
      ''
    ];

    actions.forEach((action, index) => {
      lines.push(`  // Action ${index + 1}: ${action.type}`);
      lines.push(`  await helper.executeAction(${JSON.stringify(action, null, 4)});`);
      lines.push('');
    });

    lines.push('}');
    lines.push('');
    lines.push('// Run the automation');
    lines.push('runAutomation().catch(console.error);');

    return lines.join('\\n');
  }
}