import { z } from 'zod';
import { TaskType, TaskPriority, AgentType } from '../types/agent';
import { WorkflowCategory, StepType, TriggerType } from '../types/workflow';
import { UserRole, SubscriptionStatus, NotificationChannel, PrivacyLevel } from '../types/user';

// =============================================================================
// ENTERPRISE VALIDATION SCHEMAS
// Superior Data Validation for Browser AI Agent
// =============================================================================

// =============================================================================
// COMMON VALIDATION PATTERNS
// =============================================================================

export const UUIDSchema = z.string().uuid('Invalid UUID format');
export const EmailSchema = z.string().email('Invalid email format').toLowerCase();
export const URLSchema = z.string().url('Invalid URL format');
export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format');
export const PasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');

// =============================================================================
// USER VALIDATION SCHEMAS
// =============================================================================

export const CreateUserSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  personal_info: z.object({
    first_name: z.string().min(1, 'First name is required').max(50),
    last_name: z.string().min(1, 'Last name is required').max(50),
    phone: PhoneSchema.optional(),
    timezone: z.string().default('UTC'),
    locale: z.string().default('en-US'),
  }),
  professional_info: z.object({
    current_title: z.string().max(100).optional(),
    current_company: z.string().max(100).optional(),
    industry: z.string().max(50).optional(),
    skills: z.array(z.string().max(50)).max(20).default([]),
    linkedin_url: URLSchema.optional(),
    portfolio_url: URLSchema.optional(),
    github_url: URLSchema.optional(),
  }).optional(),
  preferences: z.object({
    notification_channels: z.array(z.nativeEnum(NotificationChannel)).default([NotificationChannel.EMAIL]),
    privacy_level: z.nativeEnum(PrivacyLevel).default(PrivacyLevel.PRIVATE),
    auto_apply_enabled: z.boolean().default(false),
    max_applications_per_day: z.number().min(1).max(100).default(10),
  }).optional(),
});

export const UpdateUserSchema = z.object({
  personal_info: z.object({
    first_name: z.string().min(1).max(50).optional(),
    last_name: z.string().min(1).max(50).optional(),
    phone: PhoneSchema.optional(),
    timezone: z.string().optional(),
    locale: z.string().optional(),
    avatar_url: URLSchema.optional(),
  }).optional(),
  professional_info: z.object({
    current_title: z.string().max(100).optional(),
    current_company: z.string().max(100).optional(),
    industry: z.string().max(50).optional(),
    skills: z.array(z.string().max(50)).max(20).optional(),
    linkedin_url: URLSchema.optional(),
    portfolio_url: URLSchema.optional(),
    github_url: URLSchema.optional(),
  }).optional(),
  job_preferences: z.object({
    desired_titles: z.array(z.string().max(100)).max(10).optional(),
    preferred_locations: z.array(z.string().max(100)).max(20).optional(),
    remote_preference: z.enum(['remote_only', 'hybrid', 'onsite', 'no_preference']).optional(),
    salary_expectations: z.object({
      min: z.number().min(0).optional(),
      max: z.number().min(0).optional(),
      currency: z.string().length(3).default('USD'),
    }).optional(),
  }).optional(),
  preferences: z.object({
    notification_channels: z.array(z.nativeEnum(NotificationChannel)).optional(),
    email_notifications: z.object({
      task_completion: z.boolean().optional(),
      application_updates: z.boolean().optional(),
      weekly_summary: z.boolean().optional(),
      marketing: z.boolean().optional(),
    }).optional(),
    privacy_level: z.nativeEnum(PrivacyLevel).optional(),
    data_retention_days: z.number().min(30).max(365).optional(),
    auto_apply_enabled: z.boolean().optional(),
    max_applications_per_day: z.number().min(1).max(100).optional(),
  }).optional(),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
  remember_me: z.boolean().default(false),
  device_info: z.object({
    user_agent: z.string(),
    device_type: z.enum(['desktop', 'mobile', 'tablet', 'api']),
    browser: z.string().optional(),
    os: z.string().optional(),
  }).optional(),
});

export const ResetPasswordSchema = z.object({
  email: EmailSchema,
});

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: PasswordSchema,
});

// =============================================================================
// TASK VALIDATION SCHEMAS
// =============================================================================

export const CreateTaskSchema = z.object({
  type: z.nativeEnum(TaskType),
  command: z.string().min(1, 'Command is required').max(1000),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  parameters: z.record(z.any()).default({}),
  timeout: z.number().min(1000).max(3600000).default(300000), // 5 minutes default, max 1 hour
  scheduledFor: z.date().optional(),
  tags: z.array(z.string().max(50)).max(10).default([]),
  category: z.string().max(50).optional(),
});

export const UpdateTaskSchema = z.object({
  priority: z.nativeEnum(TaskPriority).optional(),
  parameters: z.record(z.any()).optional(),
  timeout: z.number().min(1000).max(3600000).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  category: z.string().max(50).optional(),
});

export const TaskProgressSchema = z.object({
  percentage: z.number().min(0).max(100),
  currentStep: z.string().max(200).optional(),
  estimatedTimeLeft: z.number().min(0).optional(),
});

export const TaskQuerySchema = z.object({
  status: z.string().optional(),
  type: z.nativeEnum(TaskType).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sort: z.enum(['created_at', 'updated_at', 'priority', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).optional(),
});

// =============================================================================
// WORKFLOW VALIDATION SCHEMAS
// =============================================================================

export const WorkflowStepSchema = z.object({
  name: z.string().min(1, 'Step name is required').max(100),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(StepType),
  order: z.number().min(0),
  config: z.record(z.any()).default({}),
  conditions: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'exists', 'not_exists']),
    value: z.any(),
  })).default([]),
  retry_config: z.object({
    max_attempts: z.number().min(1).max(10).default(3),
    delay_ms: z.number().min(100).max(60000).default(1000),
    backoff_multiplier: z.number().min(1).max(5).default(2),
  }).default({}),
  timeout_ms: z.number().min(1000).max(300000).default(30000),
  depends_on: z.array(z.string()).default([]),
  output_mapping: z.record(z.string()).default({}),
  preferred_agent: z.nativeEnum(AgentType).optional(),
  is_optional: z.boolean().default(false),
  is_parallel: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(10).default([]),
});

export const CreateWorkflowTemplateSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  category: z.nativeEnum(WorkflowCategory),
  tags: z.array(z.string().max(50)).max(20).default([]),
  icon: z.string().max(100).optional(),
  thumbnail_url: URLSchema.optional(),
  steps: z.array(WorkflowStepSchema).min(1, 'At least one step is required').max(100),
  parameters: z.array(z.object({
    name: z.string().min(1).max(50),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'file']),
    description: z.string().min(1).max(200),
    required: z.boolean().default(false),
    default_value: z.any().optional(),
    validation: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      options: z.array(z.any()).optional(),
    }).optional(),
  })).max(50).default([]),
  variables: z.array(z.object({
    name: z.string().min(1).max(50),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    scope: z.enum(['global', 'step', 'local']),
    initial_value: z.any().optional(),
  })).max(100).default([]),
  triggers: z.array(z.object({
    type: z.nativeEnum(TriggerType),
    config: z.record(z.any()).default({}),
    enabled: z.boolean().default(true),
  })).default([]),
  requirements: z.object({
    min_agent_version: z.string().optional(),
    required_integrations: z.array(z.string()).default([]),
    supported_browsers: z.array(z.string()).default([]),
    required_permissions: z.array(z.string()).default([]),
  }).default({}),
});

export const UpdateWorkflowTemplateSchema = CreateWorkflowTemplateSchema.partial();

export const ExecuteWorkflowSchema = z.object({
  template_id: UUIDSchema,
  parameters: z.record(z.any()).default({}),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  scheduled_for: z.date().optional(),
});

export const WorkflowReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// =============================================================================
// AGENT SESSION VALIDATION SCHEMAS
// =============================================================================

export const CreateAgentSessionSchema = z.object({
  taskId: UUIDSchema,
  agentType: z.nativeEnum(AgentType),
  context: z.object({
    viewport: z.object({
      width: z.number().min(320).max(3840).default(1920),
      height: z.number().min(240).max(2160).default(1080),
    }).default({}),
    userAgent: z.string().min(1),
  }),
});

export const UpdateAgentSessionSchema = z.object({
  status: z.string().optional(),
  currentStep: z.string().max(200).optional(),
  context: z.object({
    pageUrl: URLSchema.optional(),
    cookies: z.array(z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string(),
      path: z.string(),
      expires: z.date().optional(),
    })).optional(),
    localStorage: z.record(z.any()).optional(),
    sessionStorage: z.record(z.any()).optional(),
  }).optional(),
});

// =============================================================================
// API RESPONSE SCHEMAS
// =============================================================================

export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  total: z.number().min(0),
  pages: z.number().min(0),
});

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }).optional(),
  pagination: PaginationSchema.optional(),
  meta: z.record(z.any()).optional(),
});

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    trace_id: z.string().optional(),
  }),
});

// =============================================================================
// FILE UPLOAD VALIDATION SCHEMAS
// =============================================================================

export const FileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimetype: z.string().min(1),
  size: z.number().min(1).max(10 * 1024 * 1024), // 10MB max
  buffer: z.instanceof(Buffer),
});

export const ResumeUploadSchema = FileUploadSchema.extend({
  mimetype: z.enum(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
});

export const ImageUploadSchema = FileUploadSchema.extend({
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  size: z.number().min(1).max(5 * 1024 * 1024), // 5MB max for images
});

// =============================================================================
// SEARCH & FILTER SCHEMAS
// =============================================================================

export const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  filters: z.record(z.any()).default({}),
  sort: z.object({
    field: z.string(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }).optional(),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
  }).default({}),
});

export const DateRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
}).refine(data => data.start <= data.end, {
  message: 'Start date must be before or equal to end date',
});

// =============================================================================
// WEBHOOK VALIDATION SCHEMAS
// =============================================================================

export const WebhookSchema = z.object({
  url: URLSchema,
  secret: z.string().min(16).max(64),
  events: z.array(z.string()).min(1),
  active: z.boolean().default(true),
  headers: z.record(z.string()).default({}),
});

export const WebhookEventSchema = z.object({
  event: z.string(),
  data: z.record(z.any()),
  timestamp: z.date(),
  webhook_id: UUIDSchema,
});

// =============================================================================
// ANALYTICS & REPORTING SCHEMAS
// =============================================================================

export const AnalyticsQuerySchema = z.object({
  metric: z.enum(['tasks', 'executions', 'success_rate', 'performance', 'usage']),
  date_range: DateRangeSchema,
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  filters: z.record(z.any()).default({}),
  group_by: z.array(z.string()).default([]),
});

export const ReportGenerationSchema = z.object({
  type: z.enum(['usage', 'performance', 'billing', 'security']),
  format: z.enum(['pdf', 'csv', 'json']).default('pdf'),
  date_range: DateRangeSchema,
  include_charts: z.boolean().default(true),
  recipients: z.array(EmailSchema).default([]),
});

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export const validateRequest = <T>(schema: z.ZodSchema<T>) => {
  return (data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } => {
    try {
      const validatedData = schema.parse(data);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, errors: error };
      }
      throw error;
    }
  };
};

export const createValidationMiddleware = <T>(schema: z.ZodSchema<T>) => {
  return (req: any, res: any, next: any) => {
    const validation = validateRequest(schema)(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: validation.errors.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        },
      });
    }
    
    req.validatedBody = validation.data;
    next();
  };
};

// =============================================================================
// CUSTOM VALIDATION FUNCTIONS
// =============================================================================

export const isValidCronExpression = (cron: string): boolean => {
  const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
  return cronRegex.test(cron);
};

export const isValidSelector = (selector: string): boolean => {
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
};

export const isValidRegex = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

// =============================================================================
// SANITIZATION FUNCTIONS
// =============================================================================

export const sanitizeHtml = (html: string): string => {
  // Basic HTML sanitization - in production, use a proper library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
};

export const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
};

export const sanitizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    return parsed.toString();
  } catch {
    throw new Error('Invalid URL');
  }
};