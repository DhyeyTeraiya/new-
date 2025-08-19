import { z } from 'zod';
import { DeviceInfoSchema } from './api.schema';

export const UserPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('light'),
  language: z.string().default('en'),
  automation: z.object({
    autoConfirmLowRisk: z.boolean().default(false),
    showActionPreviews: z.boolean().default(true),
    defaultTimeout: z.number().min(1000).max(60000).default(5000),
    takeScreenshots: z.boolean().default(true),
    highlightElements: z.boolean().default(true),
  }).optional(),
  privacy: z.object({
    storeHistory: z.boolean().default(true),
    shareAnalytics: z.boolean().default(false),
    dataRetentionDays: z.number().min(1).max(365).default(30),
  }).optional(),
  notifications: z.object({
    desktop: z.boolean().default(true),
    browser: z.boolean().default(true),
    actionCompletion: z.boolean().default(true),
    errors: z.boolean().default(true),
  }).optional(),
  ai: z.object({
    responseStyle: z.enum(['concise', 'detailed', 'conversational']).default('conversational'),
    explainActions: z.boolean().default(true),
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
    modelPreferences: z.object({
      chat: z.string().default('primary'),
      reasoning: z.string().default('complex'),
      vision: z.string().default('vision'),
      fast: z.string().default('primary'),
    }).optional(),
  }).optional(),
});

export const BrowserStateSchema = z.object({
  currentTab: z.object({
    id: z.string(),
    url: z.string(),
    title: z.string(),
    active: z.boolean(),
    status: z.enum(['loading', 'complete']),
  }).nullable(),
  tabs: z.array(z.object({
    id: z.string(),
    url: z.string(),
    title: z.string(),
    active: z.boolean(),
  })).default([]),
  window: z.object({
    id: z.string(),
    width: z.number(),
    height: z.number(),
    left: z.number(),
    top: z.number(),
    focused: z.boolean(),
    state: z.enum(['normal', 'minimized', 'maximized', 'fullscreen']),
  }).optional(),
});

export const ConversationMessageSchema = z.object({
  id: z.string(),
  type: z.enum(['user', 'assistant', 'system', 'automation']),
  content: z.string(),
  timestamp: z.date(),
  actions: z.array(z.any()).optional(), // Will be properly typed later
  metadata: z.record(z.any()).optional()
});

export const UserSessionSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  browserState: BrowserStateSchema,
  conversationHistory: z.array(ConversationMessageSchema).default([]),
  preferences: UserPreferencesSchema,
  metadata: z.record(z.any()).default({}),
  createdAt: z.date(),
  lastActivity: z.date(),
  expiresAt: z.date().optional(),
  deviceInfo: DeviceInfoSchema.optional()
});