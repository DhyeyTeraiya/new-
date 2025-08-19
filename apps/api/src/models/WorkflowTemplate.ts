import mongoose, { Schema, Document } from 'mongoose';
import { WorkflowTemplate, WorkflowCategory, WorkflowStatus, StepType, TriggerType } from '@browser-ai-agent/shared/types/workflow';
import { AgentType } from '@browser-ai-agent/shared/types/agent';

// =============================================================================
// WORKFLOW TEMPLATE MODEL (MongoDB Schema)
// Superior Workflow Marketplace System
// =============================================================================

export interface IWorkflowTemplateDocument extends Omit<WorkflowTemplate, 'id'>, Document {
  _id: string;
}

const WorkflowStepSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  type: {
    type: String,
    enum: Object.values(StepType),
    required: true,
  },
  order: { type: Number, required: true, min: 0 },
  
  // Step Configuration
  config: { type: Schema.Types.Mixed, default: {} },
  
  // Conditions & Logic
  conditions: [{
    field: String,
    operator: {
      type: String,
      enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'exists', 'not_exists'],
    },
    value: Schema.Types.Mixed,
  }],
  
  // Error Handling
  retry_config: {
    max_attempts: { type: Number, min: 1, max: 10, default: 3 },
    delay_ms: { type: Number, min: 100, max: 60000, default: 1000 },
    backoff_multiplier: { type: Number, min: 1, max: 5, default: 2 },
  },
  
  // Timeout & Performance
  timeout_ms: { type: Number, min: 1000, max: 300000, default: 30000 },
  
  // Dependencies
  depends_on: [String],
  
  // Output Mapping
  output_mapping: { type: Schema.Types.Mixed, default: {} },
  
  // Agent Assignment
  preferred_agent: {
    type: String,
    enum: Object.values(AgentType),
  },
  
  // Metadata
  is_optional: { type: Boolean, default: false },
  is_parallel: { type: Boolean, default: false },
  tags: [String],
});

const WorkflowTemplateSchema = new Schema<IWorkflowTemplateDocument>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
    index: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
  },
  category: {
    type: String,
    enum: Object.values(WorkflowCategory),
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(WorkflowStatus),
    default: WorkflowStatus.DRAFT,
    index: true,
  },
  
  // Authorship
  created_by: {
    type: String,
    required: true,
    index: true,
  },
  organization_id: {
    type: String,
    index: true,
  },
  
  // Template Configuration
  version: {
    type: String,
    default: '1.0.0',
    validate: {
      validator: function(v: string) {
        return /^\d+\.\d+\.\d+$/.test(v);
      },
      message: 'Version must follow semantic versioning (x.y.z)',
    },
  },
  tags: {
    type: [String],
    validate: {
      validator: function(v: string[]) {
        return v.length <= 20;
      },
      message: 'Maximum 20 tags allowed',
    },
    index: true,
  },
  icon: String,
  thumbnail_url: {
    type: String,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Thumbnail URL must be a valid HTTP/HTTPS URL',
    },
  },
  
  // Workflow Definition
  steps: {
    type: [WorkflowStepSchema],
    validate: {
      validator: function(v: any[]) {
        return v.length > 0 && v.length <= 100;
      },
      message: 'Workflow must have between 1 and 100 steps',
    },
  },
  
  // Parameters & Variables
  parameters: [{
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'array', 'object', 'file'],
      required: true,
    },
    description: { type: String, required: true },
    required: { type: Boolean, default: false },
    default_value: Schema.Types.Mixed,
    validation: {
      min: Number,
      max: Number,
      pattern: String,
      options: [Schema.Types.Mixed],
    },
  }],
  
  variables: [{
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'array', 'object'],
      required: true,
    },
    scope: {
      type: String,
      enum: ['global', 'step', 'local'],
      required: true,
    },
    initial_value: Schema.Types.Mixed,
  }],
  
  // Triggers
  triggers: [{
    type: {
      type: String,
      enum: Object.values(TriggerType),
      required: true,
    },
    config: { type: Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true },
  }],
  
  // Marketplace Info
  marketplace: {
    is_public: { type: Boolean, default: false, index: true },
    price: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: 'USD' },
    license: {
      type: String,
      enum: ['free', 'commercial', 'enterprise'],
      default: 'free',
    },
    rating: { type: Number, min: 0, max: 5, default: 0, index: true },
    downloads: { type: Number, min: 0, default: 0, index: true },
    reviews: [{
      user_id: { type: String, required: true },
      rating: { type: Number, min: 1, max: 5, required: true },
      comment: String,
      created_at: { type: Date, default: Date.now },
    }],
  },
  
  // Performance & Analytics
  analytics: {
    success_rate: { type: Number, min: 0, max: 100, default: 0 },
    average_execution_time: { type: Number, min: 0, default: 0 },
    total_executions: { type: Number, min: 0, default: 0 },
    last_execution: Date,
  },
  
  // Requirements & Compatibility
  requirements: {
    min_agent_version: String,
    required_integrations: [String],
    supported_browsers: [String],
    required_permissions: [String],
  },
  
  published_at: Date,
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// =============================================================================
// INDEXES FOR PERFORMANCE
// =============================================================================

WorkflowTemplateSchema.index({ name: 'text', description: 'text', tags: 'text' });
WorkflowTemplateSchema.index({ category: 1, status: 1 });
WorkflowTemplateSchema.index({ created_by: 1, status: 1 });
WorkflowTemplateSchema.index({ 'marketplace.is_public': 1, status: 1 });
WorkflowTemplateSchema.index({ 'marketplace.rating': -1, 'marketplace.downloads': -1 });
WorkflowTemplateSchema.index({ created_at: -1 });
WorkflowTemplateSchema.index({ published_at: -1 });

// Compound indexes for marketplace queries
WorkflowTemplateSchema.index({ 
  category: 1, 
  'marketplace.is_public': 1, 
  status: 1, 
  'marketplace.rating': -1 
});

// =============================================================================
// VIRTUAL PROPERTIES
// =============================================================================

WorkflowTemplateSchema.virtual('average_rating').get(function() {
  if (this.marketplace.reviews.length === 0) return 0;
  
  const sum = this.marketplace.reviews.reduce((acc, review) => acc + review.rating, 0);
  return sum / this.marketplace.reviews.length;
});

WorkflowTemplateSchema.virtual('complexity_score').get(function() {
  let score = this.steps.length * 2; // Base complexity from step count
  
  // Add complexity for conditions
  this.steps.forEach(step => {
    score += step.conditions.length * 3;
    if (step.is_parallel) score += 5;
    if (step.depends_on.length > 0) score += step.depends_on.length * 2;
  });
  
  // Add complexity for parameters and variables
  score += this.parameters.length * 1;
  score += this.variables.length * 1;
  
  return Math.min(100, score); // Cap at 100
});

WorkflowTemplateSchema.virtual('estimated_duration').get(function() {
  // Estimate duration based on steps and their timeouts
  return this.steps.reduce((total, step) => total + (step.timeout_ms || 30000), 0);
});

// =============================================================================
// METHODS
// =============================================================================

WorkflowTemplateSchema.methods.publish = function() {
  if (this.status !== WorkflowStatus.DRAFT) {
    throw new Error('Only draft workflows can be published');
  }
  
  this.status = WorkflowStatus.PUBLISHED;
  this.published_at = new Date();
  this.marketplace.is_public = true;
  
  return this.save();
};

WorkflowTemplateSchema.methods.addReview = function(userId: string, rating: number, comment?: string) {
  // Check if user already reviewed
  const existingReview = this.marketplace.reviews.find(review => review.user_id === userId);
  
  if (existingReview) {
    existingReview.rating = rating;
    existingReview.comment = comment;
    existingReview.created_at = new Date();
  } else {
    this.marketplace.reviews.push({
      user_id: userId,
      rating,
      comment,
      created_at: new Date(),
    });
  }
  
  // Update average rating
  this.marketplace.rating = this.average_rating;
  
  return this.save();
};

WorkflowTemplateSchema.methods.incrementDownloads = function() {
  this.marketplace.downloads += 1;
  return this.save();
};

WorkflowTemplateSchema.methods.updateAnalytics = function(executionTime: number, success: boolean) {
  this.analytics.total_executions += 1;
  this.analytics.last_execution = new Date();
  
  // Update average execution time
  const currentAvg = this.analytics.average_execution_time;
  const totalExecs = this.analytics.total_executions;
  this.analytics.average_execution_time = ((currentAvg * (totalExecs - 1)) + executionTime) / totalExecs;
  
  // Update success rate
  const currentSuccessRate = this.analytics.success_rate;
  const successCount = Math.round((currentSuccessRate / 100) * (totalExecs - 1));
  const newSuccessCount = successCount + (success ? 1 : 0);
  this.analytics.success_rate = (newSuccessCount / totalExecs) * 100;
  
  return this.save();
};

WorkflowTemplateSchema.methods.validateWorkflow = function() {
  const errors: string[] = [];
  
  // Validate steps
  if (this.steps.length === 0) {
    errors.push('Workflow must have at least one step');
  }
  
  // Check for circular dependencies
  const stepIds = this.steps.map(step => step.id);
  this.steps.forEach(step => {
    step.depends_on.forEach(depId => {
      if (!stepIds.includes(depId)) {
        errors.push(`Step ${step.name} depends on non-existent step ${depId}`);
      }
    });
  });
  
  // Validate parameters
  const paramNames = this.parameters.map(p => p.name);
  const duplicateParams = paramNames.filter((name, index) => paramNames.indexOf(name) !== index);
  if (duplicateParams.length > 0) {
    errors.push(`Duplicate parameter names: ${duplicateParams.join(', ')}`);
  }
  
  // Validate variables
  const varNames = this.variables.map(v => v.name);
  const duplicateVars = varNames.filter((name, index) => varNames.indexOf(name) !== index);
  if (duplicateVars.length > 0) {
    errors.push(`Duplicate variable names: ${duplicateVars.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

WorkflowTemplateSchema.methods.createVersion = function(newVersion: string) {
  const newWorkflow = new (this.constructor as any)(this.toObject());
  newWorkflow._id = new mongoose.Types.ObjectId();
  newWorkflow.version = newVersion;
  newWorkflow.status = WorkflowStatus.DRAFT;
  newWorkflow.published_at = undefined;
  newWorkflow.marketplace.is_public = false;
  newWorkflow.marketplace.downloads = 0;
  newWorkflow.marketplace.reviews = [];
  newWorkflow.analytics = {
    success_rate: 0,
    average_execution_time: 0,
    total_executions: 0,
  };
  
  return newWorkflow;
};

// =============================================================================
// STATIC METHODS
// =============================================================================

WorkflowTemplateSchema.statics.findPublic = function(filters: any = {}) {
  const query = {
    'marketplace.is_public': true,
    status: WorkflowStatus.PUBLISHED,
    ...filters,
  };
  
  return this.find(query)
    .sort({ 'marketplace.rating': -1, 'marketplace.downloads': -1 });
};

WorkflowTemplateSchema.statics.searchTemplates = function(searchQuery: string, filters: any = {}) {
  const query = {
    $text: { $search: searchQuery },
    'marketplace.is_public': true,
    status: WorkflowStatus.PUBLISHED,
    ...filters,
  };
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

WorkflowTemplateSchema.statics.getPopular = function(category?: WorkflowCategory, limit = 20) {
  const query: any = {
    'marketplace.is_public': true,
    status: WorkflowStatus.PUBLISHED,
  };
  
  if (category) {
    query.category = category;
  }
  
  return this.find(query)
    .sort({ 'marketplace.downloads': -1, 'marketplace.rating': -1 })
    .limit(limit);
};

WorkflowTemplateSchema.statics.getTrending = function(days = 7, limit = 20) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        'marketplace.is_public': true,
        status: WorkflowStatus.PUBLISHED,
        'analytics.last_execution': { $gte: cutoff },
      }
    },
    {
      $addFields: {
        trend_score: {
          $multiply: [
            '$analytics.total_executions',
            { $divide: ['$marketplace.rating', 5] },
            { $divide: ['$marketplace.downloads', 100] },
          ]
        }
      }
    },
    { $sort: { trend_score: -1 } },
    { $limit: limit },
  ]);
};

WorkflowTemplateSchema.statics.getByUser = function(userId: string, includePrivate = true) {
  const query: any = { created_by: userId };
  
  if (!includePrivate) {
    query['marketplace.is_public'] = true;
    query.status = WorkflowStatus.PUBLISHED;
  }
  
  return this.find(query).sort({ created_at: -1 });
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

WorkflowTemplateSchema.pre('save', function(next) {
  // Auto-generate step IDs if not provided
  this.steps.forEach((step, index) => {
    if (!step.id) {
      step.id = `step_${index + 1}_${Date.now()}`;
    }
  });
  
  // Validate workflow before saving
  if (this.isModified('steps') || this.isModified('parameters') || this.isModified('variables')) {
    const validation = this.validateWorkflow();
    if (!validation.valid) {
      return next(new Error(`Workflow validation failed: ${validation.errors.join(', ')}`));
    }
  }
  
  // Update marketplace rating when reviews change
  if (this.isModified('marketplace.reviews')) {
    this.marketplace.rating = this.average_rating;
  }
  
  next();
});

export const WorkflowTemplate = mongoose.model<IWorkflowTemplateDocument>('WorkflowTemplate', WorkflowTemplateSchema);