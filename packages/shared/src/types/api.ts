// API types for backend communication

export interface APIResponse<T = any> {
  /** Response success status */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error information */
  error?: APIError;
  /** Response metadata */
  metadata?: APIResponseMetadata;
  /** Response timestamp */
  timestamp: Date;
}

export interface APIError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Error details */
  details?: Record<string, any>;
  /** Whether error is retryable */
  retryable: boolean;
  /** Suggested actions */
  suggestedActions?: string[];
}

export interface APIResponseMetadata {
  /** Request ID */
  requestId: string;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Rate limit information */
  rateLimit?: RateLimitInfo;
  /** API version */
  version: string;
}

export interface RateLimitInfo {
  /** Requests remaining */
  remaining: number;
  /** Rate limit reset time */
  resetTime: Date;
  /** Total requests allowed */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

// Chat API types
export interface ChatRequest {
  /** User message */
  message: string;
  /** Session ID */
  sessionId: string;
  /** Current page context */
  pageContext?: PageContext;
  /** Message type */
  type: MessageType;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface ChatResponse {
  /** AI response */
  response: AIResponse;
  /** Updated session state */
  sessionState?: Partial<UserSession>;
}

// Automation API types
export interface AutomationRequest {
  /** Actions to execute */
  actions: BrowserAction[];
  /** Session ID */
  sessionId: string;
  /** Execution options */
  options?: AutomationOptions;
}

export interface AutomationOptions {
  /** Whether to execute immediately */
  immediate: boolean;
  /** Whether to require confirmation */
  requireConfirmation: boolean;
  /** Timeout for entire automation */
  timeout: number;
  /** Whether to continue on errors */
  continueOnError: boolean;
}

export interface AutomationResponse {
  /** Automation ID */
  automationId: string;
  /** Execution results */
  results: ActionResult[];
  /** Final automation state */
  finalState: AutomationState;
}

// Session API types
export interface SessionCreateRequest {
  /** User ID */
  userId?: string;
  /** Initial preferences */
  preferences?: Partial<UserPreferences>;
  /** Device information */
  deviceInfo: DeviceInfo;
}

export interface SessionCreateResponse {
  /** Created session */
  session: UserSession;
  /** Authentication token */
  token: string;
}

export interface SessionUpdateRequest {
  /** Session ID */
  sessionId: string;
  /** Updates to apply */
  updates: Partial<UserSession>;
}

// Authentication types
export interface AuthRequest {
  /** Authentication method */
  method: 'anonymous' | 'token' | 'oauth';
  /** Credentials */
  credentials?: Record<string, any>;
}

export interface AuthResponse {
  /** Authentication token */
  token: string;
  /** Token expiry */
  expiresAt: Date;
  /** User information */
  user: UserInfo;
}

export interface UserInfo {
  /** User ID */
  id: string;
  /** User email */
  email?: string;
  /** User name */
  name?: string;
  /** User role */
  role: 'user' | 'admin';
  /** Account creation date */
  createdAt: Date;
}

// NVIDIA API types
export interface NVIDIARequest {
  /** Model to use */
  model: string;
  /** Messages for chat completion */
  messages: NVIDIAMessage[];
  /** Generation parameters */
  parameters?: NVIDIAParameters;
}

export interface NVIDIAMessage {
  /** Message role */
  role: 'system' | 'user' | 'assistant';
  /** Message content */
  content: string;
  /** Message metadata */
  metadata?: Record<string, any>;
}

export interface NVIDIAParameters {
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Temperature for randomness */
  temperature?: number;
  /** Top-p sampling */
  top_p?: number;
  /** Whether to stream response */
  stream?: boolean;
  /** Stop sequences */
  stop?: string[];
}

export interface NVIDIAResponse {
  /** Response ID */
  id: string;
  /** Generated choices */
  choices: NVIDIAChoice[];
  /** Token usage */
  usage: TokenUsage;
  /** Model used */
  model: string;
  /** Creation timestamp */
  created: number;
}

export interface NVIDIAChoice {
  /** Choice index */
  index: number;
  /** Generated message */
  message: NVIDIAMessage;
  /** Finish reason */
  finish_reason: 'stop' | 'length' | 'content_filter';
}