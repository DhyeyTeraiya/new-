// Browser action types for automation

export interface BrowserAction {
  /** Unique action ID */
  id: string;
  /** Action type */
  type: BrowserActionType;
  /** Target element selector */
  target?: ElementSelector;
  /** Action value (for typing, selecting, etc.) */
  value?: string;
  /** Action options */
  options?: ActionOptions;
  /** Action description */
  description: string;
  /** Expected result */
  expectedResult?: string;
}

export type BrowserActionType =
  | 'click'          // Click an element
  | 'type'           // Type text into an input
  | 'scroll'         // Scroll the page
  | 'navigate'       // Navigate to a URL
  | 'wait'           // Wait for an element or time
  | 'extract'        // Extract data from elements
  | 'screenshot'     // Take a screenshot
  | 'select'         // Select from dropdown
  | 'hover'          // Hover over element
  | 'drag'           // Drag and drop
  | 'key_press'      // Press keyboard keys
  | 'form_submit'    // Submit a form
  | 'tab_switch'     // Switch browser tabs
  | 'reload'         // Reload the page
  | 'back'           // Go back in history
  | 'forward';       // Go forward in history

export interface ElementSelector {
  /** CSS selector */
  css?: string;
  /** XPath selector */
  xpath?: string;
  /** Text content to match */
  text?: string;
  /** Element attributes to match */
  attributes?: Record<string, string>;
  /** Selection strategy priority */
  strategy: SelectionStrategy[];
}

export type SelectionStrategy = 
  | 'css'            // Use CSS selector
  | 'xpath'          // Use XPath selector
  | 'text'           // Match by text content
  | 'attributes'     // Match by attributes
  | 'position'       // Match by position
  | 'ai_vision';     // Use AI vision to identify

export interface ActionOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to wait for element to be visible */
  waitForVisible?: boolean;
  /** Whether to wait for element to be enabled */
  waitForEnabled?: boolean;
  /** Number of retry attempts */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Whether to take screenshot before action */
  screenshotBefore?: boolean;
  /** Whether to take screenshot after action */
  screenshotAfter?: boolean;
  /** Whether to highlight element before action */
  highlight?: boolean;
  /** Custom wait conditions */
  waitConditions?: WaitCondition[];
}

export interface WaitCondition {
  /** Condition type */
  type: 'element_visible' | 'element_hidden' | 'text_present' | 'url_change' | 'custom';
  /** Target selector or condition */
  target: string;
  /** Timeout for this condition */
  timeout: number;
}

export interface ActionResult {
  /** Action ID that was executed */
  actionId: string;
  /** Whether action succeeded */
  success: boolean;
  /** Result data (extracted content, etc.) */
  data?: any;
  /** Screenshot after action */
  screenshot?: string;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Element that was actually targeted */
  actualTarget?: ElementInfo;
  /** Additional metadata */
  metadata?: Record<string, any>;
}