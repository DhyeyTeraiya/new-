// Page context types for understanding webpage state

export interface PageContext {
  /** Current page URL */
  url: string;
  /** Page title */
  title: string;
  /** Main page content (cleaned text) */
  content: string;
  /** Interactive elements on the page */
  elements: ElementInfo[];
  /** Viewport information */
  viewport: ViewportInfo;
  /** Page metadata */
  metadata: PageMetadata;
  /** Timestamp when context was captured */
  timestamp: Date;
}

export interface ElementInfo {
  /** Unique identifier for the element */
  id: string;
  /** Element tag name (div, button, input, etc.) */
  tagName: string;
  /** Element type (for inputs) */
  type?: string;
  /** CSS selector to find this element */
  selector: string;
  /** XPath selector as backup */
  xpath: string;
  /** Element text content */
  text: string;
  /** Element attributes */
  attributes: Record<string, string>;
  /** Element position and size */
  bounds: ElementBounds;
  /** Whether element is visible */
  visible: boolean;
  /** Whether element is interactive */
  interactive: boolean;
  /** Element role for accessibility */
  role?: string;
}

export interface ElementBounds {
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
  /** Width */
  width: number;
  /** Height */
  height: number;
}

export interface ViewportInfo {
  /** Viewport width */
  width: number;
  /** Viewport height */
  height: number;
  /** Current scroll position */
  scrollX: number;
  scrollY: number;
  /** Device pixel ratio */
  devicePixelRatio: number;
}

export interface PageMetadata {
  /** Page description */
  description?: string;
  /** Page keywords */
  keywords?: string[];
  /** Open Graph data */
  ogData?: Record<string, string>;
  /** Page language */
  language?: string;
  /** Page loading state */
  loadingState: 'loading' | 'interactive' | 'complete';
  /** Whether page has forms */
  hasForms: boolean;
  /** Whether page has interactive elements */
  hasInteractiveElements: boolean;
}