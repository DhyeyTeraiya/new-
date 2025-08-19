import { z } from 'zod';

export const AIResponseSchema = z.object({
  id: z.string(),
  content: z.string(),
  type: z.enum(['text', 'action', 'error', 'system']),
  timestamp: z.date(),
  confidence: z.number().min(0).max(1).optional(),
  actions: z.array(z.any()).optional(), // Will be properly typed later
  metadata: z.record(z.any()).optional()
});

export const TokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number()
});

export const NVIDIAMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string()
});

export const NVIDIAParametersSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  stop: z.array(z.string()).optional()
});

export const NVIDIARequestSchema = z.object({
  model: z.string(),
  messages: z.array(NVIDIAMessageSchema),
  parameters: NVIDIAParametersSchema.optional(),
  stream: z.boolean().optional()
});