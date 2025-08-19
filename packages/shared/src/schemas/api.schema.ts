import { z } from 'zod';
import { PageContextSchema } from './page-context.schema';
import { BrowserActionSchema } from './browser-action.schema';

export const APIErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
  retryable: z.boolean(),
  suggestedActions: z.array(z.string()).optional(),
});

export const RateLimitInfoSchema = z.object({
  remaining: z.number(),
  resetTime: z.date(),
  limit: z.number(),
  windowSeconds: z.number(),
});

export const APIResponseMetadataSchema = z.object({
  requestId: z.string(),
  processingTime: z.number(),
  rateLimit: RateLimitInfoSchema.optional(),
  version: z.string(),
});

export const APIResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: APIErrorSchema.optional(),
  metadata: APIResponseMetadataSchema.optional(),
  timestamp: z.date(),
});

export const MessageTypeSchema = z.enum([
  'text',
  'command',
  'response',
  'action_result',
  'error',
  'system',
  'confirmation',
]);

export const ChatRequestSchema = z.object({
  message: z.string(),
  sessionId: z.string(),
  pageContext: PageContextSchema.optional(),
  type: MessageTypeSchema,
  metadata: z.record(z.any()).optional(),
});

export const AutomationOptionsSchema = z.object({
  immediate: z.boolean(),
  requireConfirmation: z.boolean(),
  timeout: z.number(),
  continueOnError: z.boolean(),
});

export const AutomationRequestSchema = z.object({
  actions: z.array(BrowserActionSchema),
  sessionId: z.string(),
  options: AutomationOptionsSchema.optional(),
});

export const DeviceInfoSchema = z.object({
  type: z.enum(['desktop', 'mobile', 'tablet']),
  os: z.string(),
  browser: z.string(),
  browserVersion: z.string(),
  screenResolution: z.string(),
});

export const SessionCreateRequestSchema = z.object({
  userId: z.string().optional(),
  preferences: z.any().optional(), // Partial<UserPreferences>
  deviceInfo: DeviceInfoSchema,
});

export const AuthRequestSchema = z.object({
  method: z.enum(['anonymous', 'token', 'oauth']),
  credentials: z.record(z.any()).optional(),
});

export const NVIDIAMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
});

export const NVIDIAParametersSchema = z.object({
  max_tokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stream: z.boolean().optional(),
  stop: z.array(z.string()).optional(),
});

export const NVIDIARequestSchema = z.object({
  model: z.string(),
  messages: z.array(NVIDIAMessageSchema),
  parameters: NVIDIAParametersSchema.optional(),
});

// Type exports
export type APIError = z.infer<typeof APIErrorSchema>;
export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>;
export type APIResponseMetadata = z.infer<typeof APIResponseMetadataSchema>;
export type APIResponse<T = any> = Omit<z.infer<typeof APIResponseSchema>, 'data'> & { data?: T };
export type MessageType = z.infer<typeof MessageTypeSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type AutomationOptions = z.infer<typeof AutomationOptionsSchema>;
export type AutomationRequest = z.infer<typeof AutomationRequestSchema>;
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;
export type AuthRequest = z.infer<typeof AuthRequestSchema>;
export type NVIDIAMessage = z.infer<typeof NVIDIAMessageSchema>;
export type NVIDIAParameters = z.infer<typeof NVIDIAParametersSchema>;
export type NVIDIARequest = z.infer<typeof NVIDIARequestSchema>;