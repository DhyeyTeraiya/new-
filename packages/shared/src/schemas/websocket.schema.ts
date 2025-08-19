import { z } from 'zod';

export const WebSocketMessageSchema = z.object({
  id: z.string(),
  type: z.enum([
    'chat_message',
    'ai_response', 
    'action_request',
    'action_result',
    'action_error',
    'context_update',
    'session_update',
    'automation_status',
    'page_screenshot',
    'element_highlight',
    'connection_status',
    'error'
  ]),
  sessionId: z.string(),
  timestamp: z.date(),
  data: z.any()
});

export const ConnectionStatusSchema = z.object({
  connected: z.boolean(),
  sessionId: z.string().optional(),
  lastActivity: z.date().optional(),
  reconnectAttempts: z.number().default(0)
});

export const AutomationStatusSchema = z.object({
  status: z.enum(['idle', 'running', 'paused', 'completed', 'error']),
  progress: z.number().min(0).max(100).optional(),
  currentStep: z.string().optional(),
  totalSteps: z.number().optional(),
  estimatedTimeRemaining: z.number().optional()
});