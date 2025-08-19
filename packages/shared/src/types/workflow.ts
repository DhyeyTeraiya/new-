import { z } from 'zod';
import { AgentType, TaskType, TaskPriority } from './agent';

// =============================================================================
// WORKFLOW & TEMPLATE TYPES (Master Plan Workflow Marketplace)
// =============================================================================

export enum WorkflowCategory {
  JOB_AUTOMATION = 'job_automation',
  COMPANY_RESEARCH = 'company_research',
  LEAD_GENERATION = 'lead_generation',
  DATA_EXTRACTION = 'data_extraction',
  FORM_AUTOMATION = 'form_automation',
  SOCIAL_MEDIA = 'social_media',
  E_COMMERCE = 'e_commerce',
  CUSTOM = 'custom',
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  PRIVATE = 'private',
}

export enum StepType {
  NAVIGATE = 'navigate',
  CLICK = 'click',
  TYPE = 'type',
  EXTRACT = 'extract',
  WAIT = 'wait',
  CONDITION = 'condition',
  LOOP = 'loop',
  API_CALL = 'api_call',
  CUSTOM_CODE = 'custom_code',
  AI_DECISION = 'ai_decision',
}

export enum TriggerType {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  WEBHOOK = 'webhook',
  EMAIL = 'email',
  FILE_UPLOAD = 'file_upload',
  API = 'api',
}

// =============================================================================
// WORKFLOW STEP SCHEMA
// =============================================================================

export const WorkflowStepSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.nativeEnum(StepType),
  order: z.number().min(0),
  
  // Step Configuration
  config: z.record(z.any()), // Step-specific configuration
  
  // Conditions & Logic
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'exists', 'not_exists']),
    value: z.any(),
  })),
  
  // Error Handling
  retry_config: z.object({
    max_attempts: z.number().min(1).max(10).default(3),
    delay_ms: z.number().min(100).max(60000).default(1000),
    backoff_multiplier: z.number().min(1).max(5).default(2),
  }),
  
  // Timeout & Performance
  timeout_ms: z.number().min(1000).max(300000).default(30000), // 30 seconds default
  
  // Dependencies
  depends_on: z.array(z.string().uuid()),
  
  // Output Mapping
  output_mapping: z.record(z.string()), // Map step outputs to workflow variables
  
  // Agent Assignment
  preferred_agent: z.nativeEnum(AgentType).optional(),
  
  // Metadata
  is_optional: z.boolean().default(false),
  is_parallel: z.boolean().default(false),
  tags: z.array(z.string()),
});

// =============================================================================
// WORKFLOW TEMPLATE SCHEMA
// =============================================================================

export const WorkflowTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string(),
  category: z.nativeEnum(WorkflowCategory),
  status: z.nativeEnum(WorkflowStatus).default(WorkflowStatus.DRAFT),
  
  // Authorship
  created_by: z.string().uuid(),
  organization_id: z.string().uuid().optional(),
  
  // Template Configuration
  version: z.string().default('1.0.0'),
  tags: z.array(z.string()),
  icon: z.string().optional(),
  thumbnail_url: z.string().url().optional(),
  
  // Workflow Definition
  steps: z.array(WorkflowStepSchema),
  
  // Parameters & Variables
  parameters: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'file']),
    description: z.string(),
    required: z.boolean().default(false),
    default_value: z.any().optional(),
    validation: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      options: z.array(z.any()).optional(),
    }).optional(),
  })),
  
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    scope: z.enum(['global', 'step', 'local']),
    initial_value: z.any().optional(),
  })),
  
  // Triggers
  triggers: z.array(z.object({
    type: z.nativeEnum(TriggerType),
    config: z.record(z.any()),
    enabled: z.boolean().default(true),
  })),
  
  // Marketplace Info
  marketplace: z.object({
    is_public: z.boolean().default(false),
    price: z.number().min(0).default(0), // 0 = free
    currency: z.string().default('USD'),
    license: z.enum(['free', 'commercial', 'enterprise']).default('free'),
    rating: z.number().min(0).max(5).default(0),
    downloads: z.number().min(0).default(0),
    reviews: z.array(z.object({
      user_id: z.string().uuid(),
      rating: z.number().min(1).max(5),
      comment: z.string().optional(),
      created_at: z.date(),
    })),
  }),
  
  // Performance & Analytics
  analytics: z.object({
    success_rate: z.number().min(0).max(100).default(0),
    average_execution_time: z.number().min(0).default(0), // milliseconds
    total_executions: z.number().min(0).default(0),
    last_execution: z.date().optional(),
  }),
  
  // Requirements & Compatibility
  requirements: z.object({
    min_agent_version: z.string().optional(),
    required_integrations: z.array(z.string()),
    supported_browsers: z.array(z.string()),
    required_permissions: z.array(z.string()),
  }),
  
  created_at: z.date(),
  updated_at: z.date(),
  published_at: z.date().optional(),
});

// =============================================================================
// WORKFLOW EXECUTION SCHEMA
// =============================================================================

export const WorkflowExecutionSchema = z.object({
  id: z.string().uuid(),
  workflow_template_id: z.string().uuid(),
  user_id: z.string().uuid(),
  
  // Execution Context
  parameters: z.record(z.any()), // User-provided parameter values
  variables: z.record(z.any()), // Runtime variables
  
  // Status & Progress
  status: z.enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  current_step_id: z.string().uuid().optional(),
  progress: z.object({
    completed_steps: z.number().default(0),
    total_steps: z.number(),
    percentage: z.number().min(0).max(100).default(0),
    estimated_completion: z.date().optional(),
  }),
  
  // Execution Results
  results: z.object({
    outputs: z.record(z.any()),
    artifacts: z.array(z.object({
      name: z.string(),
      type: z.string(),
      url: z.string().url(),
      size: z.number(),
    })),
    screenshots: z.array(z.string().url()),
    logs: z.array(z.object({
      timestamp: z.date(),
      level: z.enum(['debug', 'info', 'warn', 'error']),
      message: z.string(),
      step_id: z.string().uuid().optional(),
      agent_type: z.nativeEnum(AgentType).optional(),
    })),
  }).optional(),
  
  // Performance Metrics
  metrics: z.object({
    start_time: z.date(),
    end_time: z.date().optional(),
    execution_time: z.number().optional(), // milliseconds
    steps_executed: z.number().default(0),
    steps_failed: z.number().default(0),
    retries: z.number().default(0),
    cost: z.number().min(0).default(0), // in USD
  }),
  
  // Error Information
  error: z.object({
    message: z.string(),
    step_id: z.string().uuid(),
    error_code: z.string(),
    stack_trace: z.string().optional(),
    recovery_suggestions: z.array(z.string()),
  }).optional(),
  
  created_at: z.date(),
  updated_at: z.date(),
});

// =============================================================================
// WORKFLOW MARKETPLACE SCHEMA
// =============================================================================

export const WorkflowMarketplaceSchema = z.object({
  id: z.string().uuid(),
  workflow_template_id: z.string().uuid(),
  
  // Listing Information
  title: z.string().min(1),
  short_description: z.string().max(200),
  long_description: z.string(),
  keywords: z.array(z.string()),
  
  // Media
  screenshots: z.array(z.string().url()),
  demo_video_url: z.string().url().optional(),
  
  // Pricing & Licensing
  pricing: z.object({
    model: z.enum(['free', 'one_time', 'subscription', 'usage_based']),
    price: z.number().min(0),
    currency: z.string().default('USD'),
    billing_period: z.enum(['monthly', 'yearly']).optional(),
  }),
  
  // Support & Documentation
  documentation_url: z.string().url().optional(),
  support_email: z.string().email().optional(),
  changelog: z.array(z.object({
    version: z.string(),
    changes: z.array(z.string()),
    release_date: z.date(),
  })),
  
  // Marketplace Metrics
  metrics: z.object({
    views: z.number().min(0).default(0),
    downloads: z.number().min(0).default(0),
    active_users: z.number().min(0).default(0),
    revenue: z.number().min(0).default(0),
  }),
  
  // Moderation
  moderation_status: z.enum(['pending', 'approved', 'rejected', 'suspended']),
  moderation_notes: z.string().optional(),
  
  created_at: z.date(),
  updated_at: z.date(),
  published_at: z.date().optional(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
export type WorkflowMarketplace = z.infer<typeof WorkflowMarketplaceSchema>;

// =============================================================================
// WORKFLOW INTERFACES
// =============================================================================

export interface IWorkflowEngine {
  executeWorkflow(templateId: string, parameters: Record<string, any>): Promise<WorkflowExecution>;
  pauseExecution(executionId: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;
  getExecutionStatus(executionId: string): Promise<WorkflowExecution>;
  getExecutionLogs(executionId: string): Promise<any[]>;
}

export interface IWorkflowBuilder {
  createTemplate(template: Partial<WorkflowTemplate>): Promise<WorkflowTemplate>;
  updateTemplate(templateId: string, updates: Partial<WorkflowTemplate>): Promise<WorkflowTemplate>;
  validateTemplate(template: WorkflowTemplate): Promise<{ valid: boolean; errors: string[] }>;
  duplicateTemplate(templateId: string): Promise<WorkflowTemplate>;
  exportTemplate(templateId: string): Promise<string>; // JSON export
  importTemplate(templateData: string): Promise<WorkflowTemplate>;
}

export interface IWorkflowMarketplace {
  publishTemplate(templateId: string, marketplaceData: Partial<WorkflowMarketplace>): Promise<WorkflowMarketplace>;
  searchTemplates(query: string, filters: any): Promise<WorkflowTemplate[]>;
  purchaseTemplate(templateId: string, userId: string): Promise<void>;
  rateTemplate(templateId: string, userId: string, rating: number, comment?: string): Promise<void>;
  getPopularTemplates(category?: WorkflowCategory): Promise<WorkflowTemplate[]>;
}

// =============================================================================
// WORKFLOW CONSTANTS
// =============================================================================

export const WORKFLOW_LIMITS = {
  MAX_STEPS_PER_WORKFLOW: 100,
  MAX_PARAMETERS: 50,
  MAX_VARIABLES: 100,
  MAX_EXECUTION_TIME: 3600000, // 1 hour in milliseconds
  MAX_CONCURRENT_EXECUTIONS: 10,
} as const;

export const MARKETPLACE_CONFIG = {
  COMMISSION_RATE: 0.3, // 30% commission
  MIN_PRICE: 0, // Free allowed
  MAX_PRICE: 10000, // $10,000 max
  REVIEW_PERIOD_DAYS: 7,
  MIN_RATING_FOR_FEATURED: 4.0,
} as const;