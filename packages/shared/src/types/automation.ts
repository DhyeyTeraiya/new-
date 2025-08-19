// Automation engine types

export interface AutomationState {
  /** Current automation ID */
  id: string;
  /** Automation status */
  status: AutomationStatus;
  /** Current action plan */
  plan?: ActionPlan;
  /** Current step index */
  currentStep: number;
  /** Execution history */
  history: ActionResult[];
  /** Start time */
  startTime: Date;
  /** End time */
  endTime?: Date;
  /** Error information */
  error?: AutomationError;
}

export type AutomationStatus =
  | 'idle'           // No automation running
  | 'planning'       // Creating action plan
  | 'confirming'     // Waiting for user confirmation
  | 'executing'      // Executing actions
  | 'paused'         // Paused by user
  | 'completed'      // Successfully completed
  | 'failed'         // Failed with error
  | 'cancelled';     // Cancelled by user

export interface AutomationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Failed action */
  failedAction?: BrowserAction;
  /** Error details */
  details?: Record<string, any>;
  /** Whether error is recoverable */
  recoverable: boolean;
  /** Suggested recovery actions */
  recoveryActions?: BrowserAction[];
}

export interface AutomationMetrics {
  /** Total actions executed */
  totalActions: number;
  /** Successful actions */
  successfulActions: number;
  /** Failed actions */
  failedActions: number;
  /** Total execution time */
  totalTime: number;
  /** Average action time */
  averageActionTime: number;
  /** Success rate */
  successRate: number;
}

export interface BrowserInstance {
  /** Instance ID */
  id: string;
  /** Browser type */
  type: 'chromium' | 'firefox' | 'webkit';
  /** Whether headless */
  headless: boolean;
  /** Browser context */
  context: BrowserContext;
  /** Current page */
  page?: BrowserPage;
  /** Instance status */
  status: 'starting' | 'ready' | 'busy' | 'error' | 'closed';
  /** Creation time */
  createdAt: Date;
  /** Last activity */
  lastActivity: Date;
}

export interface BrowserContext {
  /** Context ID */
  id: string;
  /** User agent */
  userAgent: string;
  /** Viewport size */
  viewport: { width: number; height: number };
  /** Whether JavaScript is enabled */
  javaScriptEnabled: boolean;
  /** Cookies */
  cookies: Cookie[];
  /** Local storage */
  localStorage: Record<string, string>;
  /** Session storage */
  sessionStorage: Record<string, string>;
}

export interface BrowserPage {
  /** Page ID */
  id: string;
  /** Page URL */
  url: string;
  /** Page title */
  title: string;
  /** Loading state */
  loadState: 'load' | 'domcontentloaded' | 'networkidle';
  /** Page metrics */
  metrics: PageMetrics;
}

export interface PageMetrics {
  /** Page load time */
  loadTime: number;
  /** DOM content loaded time */
  domContentLoadedTime: number;
  /** First contentful paint */
  firstContentfulPaint: number;
  /** Largest contentful paint */
  largestContentfulPaint: number;
  /** Total page size */
  pageSize: number;
  /** Number of requests */
  requestCount: number;
}

export interface Cookie {
  /** Cookie name */
  name: string;
  /** Cookie value */
  value: string;
  /** Cookie domain */
  domain: string;
  /** Cookie path */
  path: string;
  /** Expiry time */
  expires?: Date;
  /** Whether secure */
  secure: boolean;
  /** Whether HTTP only */
  httpOnly: boolean;
  /** Same site policy */
  sameSite: 'Strict' | 'Lax' | 'None';
}