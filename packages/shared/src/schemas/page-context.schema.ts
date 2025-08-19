import { z } from 'zod';

export const ElementBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const ElementInfoSchema = z.object({
  id: z.string(),
  tagName: z.string(),
  type: z.string().optional(),
  selector: z.string(),
  xpath: z.string(),
  text: z.string(),
  attributes: z.record(z.string()),
  bounds: ElementBoundsSchema,
  visible: z.boolean(),
  interactive: z.boolean(),
  role: z.string().optional(),
});

export const ViewportInfoSchema = z.object({
  width: z.number(),
  height: z.number(),
  scrollX: z.number(),
  scrollY: z.number(),
  devicePixelRatio: z.number(),
});

export const PageMetadataSchema = z.object({
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  ogData: z.record(z.string()).optional(),
  language: z.string().optional(),
  loadingState: z.enum(['loading', 'interactive', 'complete']),
  hasForms: z.boolean(),
  hasInteractiveElements: z.boolean(),
});

export const PageContextSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  content: z.string(),
  elements: z.array(ElementInfoSchema),
  viewport: ViewportInfoSchema,
  metadata: PageMetadataSchema,
  timestamp: z.date(),
});

// Type exports
export type ElementBounds = z.infer<typeof ElementBoundsSchema>;
export type ElementInfo = z.infer<typeof ElementInfoSchema>;
export type ViewportInfo = z.infer<typeof ViewportInfoSchema>;
export type PageMetadata = z.infer<typeof PageMetadataSchema>;
export type PageContext = z.infer<typeof PageContextSchema>;