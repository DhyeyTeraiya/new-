import { z } from 'zod';

export const BrowserActionTypeSchema = z.enum([
  'click',
  'type',
  'scroll',
  'navigate',
  'wait',
  'extract',
  'screenshot',
  'select',
  'hover',
  'drag',
  'key_press',
  'form_submit',
  'tab_switch',
  'reload',
  'back',
  'forward',
]);

export const SelectionStrategySchema = z.enum([
  'css',
  'xpath',
  'text',
  'attributes',
  'position',
  'ai_vision',
]);

export const ElementSelectorSchema = z.object({
  css: z.string().optional(),
  xpath: z.string().optional(),
  text: z.string().optional(),
  attributes: z.record(z.string()).optional(),
  strategy: z.array(SelectionStrategySchema),
});

export const WaitConditionSchema = z.object({
  type: z.enum(['element_visible', 'element_hidden', 'text_present', 'url_change', 'custom']),
  target: z.string(),
  timeout: z.number(),
});

export const ActionOptionsSchema = z.object({
  timeout: z.number().optional(),
  waitForVisible: z.boolean().optional(),
  waitForEnabled: z.boolean().optional(),
  retries: z.number().optional(),
  retryDelay: z.number().optional(),
  screenshotBefore: z.boolean().optional(),
  screenshotAfter: z.boolean().optional(),
  highlight: z.boolean().optional(),
  waitConditions: z.array(WaitConditionSchema).optional(),
});

export const BrowserActionSchema = z.object({
  id: z.string(),
  type: BrowserActionTypeSchema,
  target: ElementSelectorSchema.optional(),
  value: z.string().optional(),
  options: ActionOptionsSchema.optional(),
  description: z.string(),
  expectedResult: z.string().optional(),
});

export const ActionResultSchema = z.object({
  actionId: z.string(),
  success: z.boolean(),
  data: z.any().optional(),
  screenshot: z.string().optional(),
  error: z.string().optional(),
  executionTime: z.number(),
  actualTarget: z.any().optional(), // ElementInfo
  metadata: z.record(z.any()).optional(),
});

// Type exports
export type BrowserActionType = z.infer<typeof BrowserActionTypeSchema>;
export type SelectionStrategy = z.infer<typeof SelectionStrategySchema>;
export type ElementSelector = z.infer<typeof ElementSelectorSchema>;
export type WaitCondition = z.infer<typeof WaitConditionSchema>;
export type ActionOptions = z.infer<typeof ActionOptionsSchema>;
export type BrowserAction = z.infer<typeof BrowserActionSchema>;
export type ActionResult = z.infer<typeof ActionResultSchema>;