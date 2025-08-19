// Shared types and utilities for Browser AI Agent

// Essential types for backend
export interface DeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  screenResolution: string;
  userAgent: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  automation?: {
    autoConfirmLowRisk: boolean;
    showActionPreviews: boolean;
    defaultTimeout: number;
    takeScreenshots: boolean;
    highlightElements: boolean;
  };
  privacy?: {
    storeHistory: boolean;
    shareAnalytics: boolean;
    dataRetentionDays: number;
  };
  notifications?: {
    desktop: boolean;
    browser: boolean;
    actionCompletion: boolean;
    errors: boolean;
  };
  ai?: {
    responseStyle: 'concise' | 'detailed' | 'conversational';
    explainActions: boolean;
    confidenceThreshold: number;
    modelPreferences?: {
      chat: string;
      reasoning: string;
      vision: string;
      fast: string;
    };
  };
}

export interface BrowserState {
  currentTab: {
    id: string;
    url: string;
    title: string;
    active: boolean;
    status: 'loading' | 'complete';
  } | null;
  tabs: Array<{
    id: string;
    url: string;
    title: string;
    active: boolean;
  }>;
  window?: {
    id: string;
    width: number;
    height: number;
    left: number;
    top: number;
    focused: boolean;
    state: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
  };
}

export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'automation';
  content: string;
  timestamp: Date;
  actions?: any[];
  metadata?: Record<string, any>;
}

export interface UserSession {
  id: string;
  userId?: string;
  browserState: BrowserState;
  conversationHistory: ConversationMessage[];
  preferences: UserPreferences;
  metadata: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
  expiresAt?: Date;
  deviceInfo?: DeviceInfo;
}

export interface SessionCreateRequest {
  userId?: string;
  preferences?: Partial<UserPreferences>;
  deviceInfo: DeviceInfo;
}

export interface SessionCreateResponse {
  session: UserSession;
  token: string;
}

export interface APIError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, any>;
}

export interface APIResponseMetadata {
  requestId?: string;
  version?: string;
  rateLimit?: {
    limit: number;
    remaining: number;
    resetTime: Date;
  };
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: APIResponseMetadata;
  timestamp: Date;
}

// Zod schemas for validation
import { z } from 'zod';

export const DeviceInfoSchema = z.object({
  type: z.enum(['desktop', 'mobile', 'tablet']),
  browser: z.string(),
  browserVersion: z.string(),
  os: z.string(),
  osVersion: z.string(),
  screenResolution: z.string(),
  userAgent: z.string()
});

// Constants
export const API_VERSION = '1.0.0';
export const DEFAULT_SESSION_TIMEOUT = 3600000; // 1 hour
export const MAX_SESSIONS_PER_USER = 10;