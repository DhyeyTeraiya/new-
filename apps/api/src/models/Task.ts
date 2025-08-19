import mongoose, { Schema, Document } from 'mongoose';
import { Task, TaskType, TaskStatus, TaskPriority, AgentType } from '@browser-ai-agent/shared/types/agent';

// =============================================================================
// TASK MODEL (MongoDB Schema)
// =============================================================================

export interface ITaskDocument extends Omit<Task, 'id'>, Document {
  _id: string;
}

const TaskSchema = new Schema<ITaskDocument>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: Object.values(TaskType),
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(TaskStatus),
    default: TaskStatus.PENDING,
    index: true,
  },
  priority: {
    type: String,
    enum: Object.values(TaskPriority),
    default: TaskPriority.MEDIUM,
    index: true,
  },
  assignedAgents: [{
    type: String,
    enum: Object.values(AgentType),
  }],
  command: {
    type: String,
    required: true,
    trim: true,
  },
  parameters: {
    type: Schema.Types.Mixed,
    default: {},
  },
  
  // Progress Tracking
  progress: {
    percentage: { type: Number, min: 0, max: 100, default: 0 },
    currentStep: { type: String, default: '' },
    totalSteps: { type: Number, min: 1, default: 1 },
    estimatedTimeLeft: Number, // milliseconds
  },
  
  // Results & Output
  results: {
    type: Schema.Types.Mixed,
    default: null,
  },
  
  // Error Information
  error: {
    type: String,
    default: null,
  },
  
  // Timing
  startedAt: Date,
  completedAt: Date,
  timeout: {
    type: Number,
    min: 1000,
    default: 300000, // 5 minutes
  },
  
  // Execution Metadata
  executionMetadata: {
    agentAssignments: [{
      agentType: {
        type: String,
        enum: Object.values(AgentType),
      },
      assignedAt: Date,
      completedAt: Date,
      status: String,
      result: Schema.Types.Mixed,
    }],
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    executionTime: Number, // milliseconds
    cost: { type: Number, default: 0 }, // in USD
    resourceUsage: {
      cpuTime: Number,
      memoryUsed: Number,
      networkRequests: Number,
      storageUsed: Number,
    },
  },
  
  // Audit Trail
  auditLog: [{
    timestamp: { type: Date, default: Date.now },
    action: String,
    agentType: {
      type: String,
      enum: Object.values(AgentType),
    },
    details: Schema.Types.Mixed,
    success: Boolean,
  }],
  
  // User Context
  userContext: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    deviceInfo: Schema.Types.Mixed,
  },
  
  // Scheduling
  scheduledFor: Date,
  recurring: {
    enabled: { type: Boolean, default: false },
    pattern: String, // cron pattern
    nextRun: Date,
    lastRun: Date,
  },
  
  // Collaboration
  sharedWith: [{
    userId: String,
    permission: {
      type: String,
      enum: ['view', 'edit', 'admin'],
      default: 'view',
    },
    sharedAt: { type: Date, default: Date.now },
  }],
  
  // Tags & Organization
  tags: [String],
  category: String,
  
  // External References
  externalReferences: [{
    type: String, // 'workflow', 'template', 'job_posting', etc.
    id: String,
    url: String,
  }],
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
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

TaskSchema.index({ userId: 1, status: 1 });
TaskSchema.index({ userId: 1, type: 1 });
TaskSchema.index({ userId: 1, createdAt: -1 });
TaskSchema.index({ status: 1, priority: -1 });
TaskSchema.index({ type: 1, status: 1 });
TaskSchema.index({ scheduledFor: 1 });
TaskSchema.index({ 'recurring.nextRun': 1 });
TaskSchema.index({ tags: 1 });
TaskSchema.index({ createdAt: -1 });
TaskSchema.index({ completedAt: -1 });

// Compound indexes for common queries
TaskSchema.index({ userId: 1, status: 1, createdAt: -1 });
TaskSchema.index({ status: 1, priority: -1, createdAt: 1 });
TaskSchema.index({ type: 1, status: 1, userId: 1 });

// Text search index
TaskSchema.index({ 
  command: 'text', 
  tags: 'text', 
  category: 'text' 
});

// =============================================================================
// VIRTUAL PROPERTIES
// =============================================================================

TaskSchema.virtual('duration').get(function() {
  if (this.startedAt && this.completedAt) {
    return this.completedAt.getTime() - this.startedAt.getTime();
  }
  return null;
});

TaskSchema.virtual('isRunning').get(function() {
  return this.status === TaskStatus.RUNNING;
});

TaskSchema.virtual('isCompleted').get(function() {
  return [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(this.status);
});

TaskSchema.virtual('successRate').get(function() {
  const total = this.executionMetadata.retryCount + 1;
  const successful = this.status === TaskStatus.COMPLETED ? 1 : 0;
  return (successful / total) * 100;
});

// =============================================================================
// METHODS
// =============================================================================

TaskSchema.methods.start = function() {
  this.status = TaskStatus.RUNNING;
  this.startedAt = new Date();
  this.progress.percentage = 0;
  this.addAuditLog('task_started', null, { startedAt: this.startedAt });
  return this.save();
};

TaskSchema.methods.complete = function(results: any) {
  this.status = TaskStatus.COMPLETED;
  this.completedAt = new Date();
  this.progress.percentage = 100;
  this.results = results;
  this.executionMetadata.executionTime = this.completedAt.getTime() - (this.startedAt?.getTime() || 0);
  this.addAuditLog('task_completed', null, { completedAt: this.completedAt, results });
  return this.save();
};

TaskSchema.methods.fail = function(error: string) {
  this.status = TaskStatus.FAILED;
  this.completedAt = new Date();
  this.error = error;
  this.executionMetadata.executionTime = this.completedAt.getTime() - (this.startedAt?.getTime() || 0);
  this.addAuditLog('task_failed', null, { error, completedAt: this.completedAt });
  return this.save();
};

TaskSchema.methods.pause = function() {
  if (this.status === TaskStatus.RUNNING) {
    this.status = TaskStatus.PAUSED;
    this.addAuditLog('task_paused', null, { pausedAt: new Date() });
    return this.save();
  }
  throw new Error('Task is not running and cannot be paused');
};

TaskSchema.methods.resume = function() {
  if (this.status === TaskStatus.PAUSED) {
    this.status = TaskStatus.RUNNING;
    this.addAuditLog('task_resumed', null, { resumedAt: new Date() });
    return this.save();
  }
  throw new Error('Task is not paused and cannot be resumed');
};

TaskSchema.methods.cancel = function() {
  if ([TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.PAUSED].includes(this.status)) {
    this.status = TaskStatus.CANCELLED;
    this.completedAt = new Date();
    this.addAuditLog('task_cancelled', null, { cancelledAt: this.completedAt });
    return this.save();
  }
  throw new Error('Task cannot be cancelled in its current state');
};

TaskSchema.methods.updateProgress = function(percentage: number, currentStep?: string, estimatedTimeLeft?: number) {
  this.progress.percentage = Math.max(0, Math.min(100, percentage));
  if (currentStep) this.progress.currentStep = currentStep;
  if (estimatedTimeLeft !== undefined) this.progress.estimatedTimeLeft = estimatedTimeLeft;
  
  this.addAuditLog('progress_updated', null, {
    percentage: this.progress.percentage,
    currentStep,
    estimatedTimeLeft,
  });
  
  return this.save();
};

TaskSchema.methods.assignAgent = function(agentType: AgentType) {
  if (!this.assignedAgents.includes(agentType)) {
    this.assignedAgents.push(agentType);
  }
  
  this.executionMetadata.agentAssignments.push({
    agentType,
    assignedAt: new Date(),
    status: 'assigned',
  });
  
  this.addAuditLog('agent_assigned', agentType, { agentType });
  return this.save();
};

TaskSchema.methods.addAuditLog = function(action: string, agentType?: AgentType, details?: any) {
  this.auditLog.push({
    timestamp: new Date(),
    action,
    agentType,
    details,
    success: true,
  });
};

TaskSchema.methods.retry = function() {
  if (this.executionMetadata.retryCount >= this.executionMetadata.maxRetries) {
    throw new Error('Maximum retry attempts exceeded');
  }
  
  this.executionMetadata.retryCount += 1;
  this.status = TaskStatus.PENDING;
  this.error = null;
  this.progress.percentage = 0;
  this.progress.currentStep = '';
  
  this.addAuditLog('task_retried', null, { 
    retryCount: this.executionMetadata.retryCount,
    maxRetries: this.executionMetadata.maxRetries,
  });
  
  return this.save();
};

// =============================================================================
// STATIC METHODS
// =============================================================================

TaskSchema.statics.findByUser = function(userId: string, options: any = {}) {
  const query = { userId };
  if (options.status) query.status = options.status;
  if (options.type) query.type = options.type;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

TaskSchema.statics.findRunningTasks = function() {
  return this.find({ status: TaskStatus.RUNNING });
};

TaskSchema.statics.findScheduledTasks = function() {
  return this.find({
    scheduledFor: { $lte: new Date() },
    status: TaskStatus.PENDING,
  });
};

TaskSchema.statics.findRecurringTasks = function() {
  return this.find({
    'recurring.enabled': true,
    'recurring.nextRun': { $lte: new Date() },
  });
};

TaskSchema.statics.getTaskStats = function(userId?: string) {
  const match = userId ? { userId } : {};
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgExecutionTime: { $avg: '$executionMetadata.executionTime' },
        totalCost: { $sum: '$executionMetadata.cost' },
      }
    }
  ]);
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

TaskSchema.pre('save', function(next) {
  // Auto-calculate total steps if not set
  if (this.isNew && this.progress.totalSteps === 1 && this.parameters) {
    // Estimate steps based on task complexity
    const complexity = this.estimateComplexity();
    this.progress.totalSteps = Math.max(1, complexity);
  }
  
  // Update estimated completion time
  if (this.isModified('progress.percentage') && this.startedAt && this.progress.percentage > 0) {
    const elapsed = Date.now() - this.startedAt.getTime();
    const remaining = (elapsed / this.progress.percentage) * (100 - this.progress.percentage);
    this.progress.estimatedTimeLeft = Math.round(remaining);
  }
  
  next();
});

TaskSchema.methods.estimateComplexity = function(): number {
  // Simple complexity estimation based on task type and parameters
  const baseComplexity = {
    [TaskType.JOB_SEARCH]: 5,
    [TaskType.JOB_APPLICATION]: 8,
    [TaskType.COMPANY_RESEARCH]: 10,
    [TaskType.CONTACT_SCRAPING]: 12,
    [TaskType.DATA_EXTRACTION]: 15,
    [TaskType.FORM_FILLING]: 6,
    [TaskType.CUSTOM_WORKFLOW]: 20,
  };
  
  let complexity = baseComplexity[this.type] || 10;
  
  // Adjust based on parameters
  if (this.parameters) {
    if (this.parameters.maxResults > 50) complexity += 5;
    if (this.parameters.platforms && this.parameters.platforms.length > 2) complexity += 3;
    if (this.parameters.depth === 'comprehensive') complexity += 8;
  }
  
  return complexity;
};

export const Task = mongoose.model<ITaskDocument>('Task', TaskSchema);