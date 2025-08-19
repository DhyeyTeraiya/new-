// WebSocket communication types

export interface WebSocketMessage {
  /** Message ID */
  id: string;
  /** Message type */
  type: WebSocketMessageType;
  /** Message payload */
  payload: any;
  /** Session ID */
  sessionId: string;
  /** Timestamp */
  timestamp: Date;
}

export type WebSocketMessageType =
  | 'chat_message'        // Chat message from user
  | 'ai_response'         // AI response
  | 'action_start'        // Action execution started
  | 'action_progress'     // Action execution progress
  | 'action_complete'     // Action execution completed
  | 'action_error'        // Action execution error
  | 'page_change'         // Page navigation occurred
  | 'session_update'      // Session state update
  | 'automation_start'    // Automation started
  | 'automation_progress' // Automation progress
  | 'automation_complete' // Automation completed
  | 'automation_error'    // Automation error
  | 'screenshot'          // Screenshot captured
  | 'element_highlight'   // Element highlighted
  | 'connection_status'   // Connection status change
  | 'error'               // General error
  | 'ping'                // Heartbeat ping
  | 'pong';               // Heartbeat pong

// Specific message payloads
export interface ChatMessagePayload {
  /** User message */
  message: string;
  /** Message type */
  messageType: MessageType;
  /** Page context */
  pageContext?: PageContext;
}

export interface AIResponsePayload {
  /** AI response */
  response: AIResponse;
  /** Whether response is streaming */
  streaming: boolean;
  /** Stream chunk if streaming */
  chunk?: string;
  /** Whether this is the final chunk */
  final?: boolean;
}

export interface ActionProgressPayload {
  /** Action being executed */
  action: BrowserAction;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current status */
  status: string;
  /** Screenshot if available */
  screenshot?: string;
}

export interface ActionCompletePayload {
  /** Completed action */
  action: BrowserAction;
  /** Action result */
  result: ActionResult;
}

export interface ActionErrorPayload {
  /** Failed action */
  action: BrowserAction;
  /** Error information */
  error: AutomationError;
  /** Recovery options */
  recoveryOptions?: BrowserAction[];
}

export interface PageChangePayload {
  /** Previous page context */
  previousContext?: PageContext;
  /** New page context */
  newContext: PageContext;
  /** Navigation type */
  navigationType: 'link' | 'form' | 'back' | 'forward' | 'reload' | 'script';
}

export interface SessionUpdatePayload {
  /** Session updates */
  updates: Partial<UserSession>;
  /** Update type */
  updateType: 'preferences' | 'state' | 'metadata' | 'full';
}

export interface AutomationProgressPayload {
  /** Automation ID */
  automationId: string;
  /** Current step */
  currentStep: number;
  /** Total steps */
  totalSteps: number;
  /** Progress percentage */
  progress: number;
  /** Current action */
  currentAction?: BrowserAction;
  /** Completed actions */
  completedActions: ActionResult[];
}

export interface ScreenshotPayload {
  /** Screenshot data (base64) */
  data: string;
  /** Screenshot metadata */
  metadata: ScreenshotMetadata;
}

export interface ScreenshotMetadata {
  /** Screenshot dimensions */
  width: number;
  height: number;
  /** Capture timestamp */
  timestamp: Date;
  /** Page URL when captured */
  url: string;
  /** Viewport information */
  viewport: ViewportInfo;
  /** Highlighted elements */
  highlights?: ElementBounds[];
}

export interface ElementHighlightPayload {
  /** Element to highlight */
  element: ElementInfo;
  /** Highlight style */
  style: HighlightStyle;
  /** Duration in milliseconds */
  duration: number;
}

export interface HighlightStyle {
  /** Border color */
  borderColor: string;
  /** Border width */
  borderWidth: number;
  /** Background color */
  backgroundColor?: string;
  /** Animation type */
  animation?: 'pulse' | 'fade' | 'none';
}

export interface ConnectionStatusPayload {
  /** Connection status */
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  /** Status message */
  message?: string;
  /** Reconnection attempt count */
  reconnectAttempts?: number;
  /** Next reconnection time */
  nextReconnectTime?: Date;
}

export interface WebSocketError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Error details */
  details?: Record<string, any>;
  /** Whether connection should be retried */
  retryable: boolean;
}

// Connection management types
export interface ConnectionInfo {
  /** Connection ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Connection timestamp */
  connectedAt: Date;
  /** Last activity */
  lastActivity: Date;
  /** Client information */
  clientInfo: ClientInfo;
}

export interface ClientInfo {
  /** User agent */
  userAgent: string;
  /** IP address */
  ipAddress: string;
  /** Client type */
  type: 'extension' | 'web' | 'mobile';
  /** Client version */
  version: string;
}