// User session types for state management

export interface UserSession {
  /** Unique session ID */
  id: string;
  /** User ID */
  userId: string;
  /** Current browser state */
  browserState: BrowserState;
  /** Conversation history */
  conversationHistory: Message[];
  /** User preferences */
  preferences: UserPreferences;
  /** Session metadata */
  metadata: SessionMetadata;
  /** Session creation time */
  createdAt: Date;
  /** Last activity time */
  lastActivity: Date;
  /** Session expiry time */
  expiresAt: Date;
}

export interface BrowserState {
  /** Current tab information */
  currentTab: TabInfo;
  /** All open tabs */
  tabs: TabInfo[];
  /** Browser window information */
  window: WindowInfo;
  /** Current page context */
  pageContext?: PageContext;
  /** Active automation state */
  automation?: AutomationState;
}

export interface TabInfo {
  /** Tab ID */
  id: string;
  /** Tab URL */
  url: string;
  /** Tab title */
  title: string;
  /** Whether tab is active */
  active: boolean;
  /** Tab loading state */
  status: 'loading' | 'complete';
  /** Tab favicon URL */
  favIconUrl?: string;
}

export interface WindowInfo {
  /** Window ID */
  id: string;
  /** Window dimensions */
  width: number;
  height: number;
  /** Window position */
  left: number;
  top: number;
  /** Whether window is focused */
  focused: boolean;
  /** Window state */
  state: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
}

export interface Message {
  /** Message ID */
  id: string;
  /** Message type */
  type: MessageType;
  /** Message content */
  content: string;
  /** Message sender */
  sender: 'user' | 'ai';
  /** Associated actions */
  actions?: BrowserAction[];
  /** Message metadata */
  metadata?: MessageMetadata;
  /** Message timestamp */
  timestamp: Date;
}

export type MessageType =
  | 'text'           // Plain text message
  | 'command'        // User command
  | 'response'       // AI response
  | 'action_result'  // Action execution result
  | 'error'          // Error message
  | 'system'         // System message
  | 'confirmation';  // Confirmation request

export interface MessageMetadata {
  /** Page context when message was sent */
  pageContext?: PageContext;
  /** Action results */
  actionResults?: ActionResult[];
  /** Processing time */
  processingTime?: number;
  /** Model used */
  model?: string;
}

export interface UserPreferences {
  /** UI theme */
  theme: 'light' | 'dark' | 'auto';
  /** Language preference */
  language: string;
  /** Automation settings */
  automation: AutomationPreferences;
  /** Privacy settings */
  privacy: PrivacyPreferences;
  /** Notification settings */
  notifications: NotificationPreferences;
  /** AI behavior settings */
  ai: AIPreferences;
}

export interface AutomationPreferences {
  /** Whether to auto-confirm low-risk actions */
  autoConfirmLowRisk: boolean;
  /** Whether to show action previews */
  showActionPreviews: boolean;
  /** Default timeout for actions */
  defaultTimeout: number;
  /** Whether to take screenshots */
  takeScreenshots: boolean;
  /** Whether to highlight elements */
  highlightElements: boolean;
}

export interface PrivacyPreferences {
  /** Whether to store conversation history */
  storeHistory: boolean;
  /** Whether to share usage analytics */
  shareAnalytics: boolean;
  /** Data retention period in days */
  dataRetentionDays: number;
}

export interface NotificationPreferences {
  /** Whether to show desktop notifications */
  desktop: boolean;
  /** Whether to show in-browser notifications */
  browser: boolean;
  /** Whether to notify on action completion */
  actionCompletion: boolean;
  /** Whether to notify on errors */
  errors: boolean;
}

export interface AIPreferences {
  /** Preferred response style */
  responseStyle: 'concise' | 'detailed' | 'conversational';
  /** Whether to explain actions before executing */
  explainActions: boolean;
  /** Confidence threshold for auto-execution */
  confidenceThreshold: number;
  /** Preferred models for different tasks */
  modelPreferences: ModelPreferences;
}

export interface ModelPreferences {
  /** Model for general chat */
  chat: string;
  /** Model for complex reasoning */
  reasoning: string;
  /** Model for vision tasks */
  vision: string;
  /** Model for fast responses */
  fast: string;
}

export interface SessionMetadata {
  /** Session source */
  source: 'extension' | 'web' | 'api';
  /** User agent */
  userAgent: string;
  /** IP address */
  ipAddress: string;
  /** Geographic location */
  location?: string;
  /** Device information */
  device: DeviceInfo;
}

export interface DeviceInfo {
  /** Device type */
  type: 'desktop' | 'mobile' | 'tablet';
  /** Operating system */
  os: string;
  /** Browser name */
  browser: string;
  /** Browser version */
  browserVersion: string;
  /** Screen resolution */
  screenResolution: string;
}