// Constants for Browser AI Agent

// NVIDIA API Configuration
export const NVIDIA_MODELS = {
  PRIMARY: 'meta/llama-3.3-70b-instruct',
  VISION: 'meta/llama-3.2-90b-vision-instruct',
  FAST: 'meta/llama-3.1-405B-instruct',
} as const;

export const NVIDIA_API = {
  BASE_URL: 'https://integrate.api.nvidia.com/v1',
  CHAT_ENDPOINT: '/chat/completions',
  DEFAULT_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
} as const;

// Browser Action Constants
export const ACTION_TIMEOUTS = {
  DEFAULT: 5000,
  NAVIGATION: 30000,
  FORM_SUBMIT: 10000,
  ELEMENT_WAIT: 10000,
  SCREENSHOT: 5000,
} as const;

export const ELEMENT_SELECTORS = {
  STRATEGIES: ['css', 'xpath', 'text', 'attributes', 'position', 'ai_vision'] as const,
  PRIORITY: ['css', 'xpath', 'text', 'attributes'] as const,
} as const;

// Session Configuration
export const SESSION_CONFIG = {
  DEFAULT_TIMEOUT: 3600000, // 1 hour
  MAX_CONVERSATION_HISTORY: 100,
  CLEANUP_INTERVAL: 300000, // 5 minutes
  MAX_CONCURRENT_SESSIONS: 1000,
} as const;

// WebSocket Configuration
export const WEBSOCKET_CONFIG = {
  HEARTBEAT_INTERVAL: 30000,
  RECONNECT_DELAY: 5000,
  MAX_RECONNECT_ATTEMPTS: 5,
  MESSAGE_QUEUE_SIZE: 100,
} as const;

// API Rate Limiting
export const RATE_LIMITS = {
  DEFAULT_WINDOW: 900000, // 15 minutes
  DEFAULT_MAX_REQUESTS: 100,
  BURST_WINDOW: 60000, // 1 minute
  BURST_MAX_REQUESTS: 20,
} as const;

// Error Codes
export const ERROR_CODES = {
  // Authentication errors
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  
  // Session errors
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_LIMIT_EXCEEDED: 'SESSION_LIMIT_EXCEEDED',
  
  // Automation errors
  AUTOMATION_ELEMENT_NOT_FOUND: 'AUTOMATION_ELEMENT_NOT_FOUND',
  AUTOMATION_TIMEOUT: 'AUTOMATION_TIMEOUT',
  AUTOMATION_PERMISSION_DENIED: 'AUTOMATION_PERMISSION_DENIED',
  AUTOMATION_BROWSER_ERROR: 'AUTOMATION_BROWSER_ERROR',
  
  // AI errors
  AI_REQUEST_FAILED: 'AI_REQUEST_FAILED',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_INVALID_RESPONSE: 'AI_INVALID_RESPONSE',
  AI_CONTEXT_TOO_LARGE: 'AI_CONTEXT_TOO_LARGE',
  
  // Network errors
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION_FAILED: 'NETWORK_CONNECTION_FAILED',
  NETWORK_RATE_LIMITED: 'NETWORK_RATE_LIMITED',
  
  // Validation errors
  VALIDATION_INVALID_INPUT: 'VALIDATION_INVALID_INPUT',
  VALIDATION_MISSING_REQUIRED: 'VALIDATION_MISSING_REQUIRED',
  VALIDATION_SCHEMA_ERROR: 'VALIDATION_SCHEMA_ERROR',
  
  // General errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// UI Constants
export const UI_CONFIG = {
  FLOATING_WIDGET: {
    DEFAULT_POSITION: { bottom: 20, right: 20 },
    MIN_SIZE: { width: 300, height: 400 },
    MAX_SIZE: { width: 600, height: 800 },
    Z_INDEX: 2147483647, // Maximum z-index
  },
  ANIMATIONS: {
    FADE_DURATION: 200,
    SLIDE_DURATION: 300,
    HIGHLIGHT_DURATION: 2000,
  },
  COLORS: {
    PRIMARY: '#007bff',
    SUCCESS: '#28a745',
    WARNING: '#ffc107',
    ERROR: '#dc3545',
    INFO: '#17a2b8',
  },
} as const;

// Browser Extension Constants
export const EXTENSION_CONFIG = {
  CONTENT_SCRIPT_WORLD: 'MAIN',
  MESSAGE_TIMEOUT: 5000,
  STORAGE_KEYS: {
    SESSION_ID: 'browser_ai_session_id',
    USER_PREFERENCES: 'browser_ai_preferences',
    AUTH_TOKEN: 'browser_ai_auth_token',
  },
} as const;

// Database Constants
export const DATABASE_CONFIG = {
  TABLES: {
    SESSIONS: 'sessions',
    ACTION_LOGS: 'action_logs',
    USERS: 'users',
    AUTOMATION_HISTORY: 'automation_history',
  },
  INDEXES: {
    SESSION_USER_ID: 'idx_sessions_user_id',
    SESSION_CREATED_AT: 'idx_sessions_created_at',
    ACTION_LOGS_SESSION_ID: 'idx_action_logs_session_id',
    ACTION_LOGS_EXECUTED_AT: 'idx_action_logs_executed_at',
  },
} as const;

// Performance Constants
export const PERFORMANCE_CONFIG = {
  MAX_SCREENSHOT_SIZE: 1920 * 1080,
  MAX_PAGE_CONTENT_LENGTH: 100000,
  MAX_ELEMENT_COUNT: 1000,
  CACHE_TTL: 300000, // 5 minutes
  MEMORY_CLEANUP_INTERVAL: 600000, // 10 minutes
} as const;

// Security Constants
export const SECURITY_CONFIG = {
  JWT_ALGORITHM: 'HS256',
  PASSWORD_MIN_LENGTH: 8,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 900000, // 15 minutes
  ALLOWED_ORIGINS: ['chrome-extension://', 'moz-extension://', 'http://localhost'],
  CSP_DIRECTIVES: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", 'wss:', 'https:'],
  },
} as const;