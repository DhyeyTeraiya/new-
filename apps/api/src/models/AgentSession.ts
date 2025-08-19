import mongoose, { Schema, Document } from 'mongoose';
import { AgentType, AgentStatus } from '@browser-ai-agent/shared/types/agent';

// =============================================================================
// AGENT SESSION MODEL (MongoDB Schema)
// Superior Multi-Agent Coordination System
// =============================================================================

export interface IAgentSessionDocument extends Document {
  _id: string;
  taskId: string;
  agentType: AgentType;
  status: AgentStatus;
  currentStep: string;
  
  // Agent Context & State
  context: {
    sessionId: string;
    browserId?: string;
    pageUrl?: string;
    viewport: {
      width: number;
      height: number;
    };
    userAgent: string;
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: Date;
    }>;
    localStorage: Record<string, any>;
    sessionStorage: Record<string, any>;
  };
  
  // Performance Metrics
  metrics: {
    startTime: Date;
    endTime?: Date;
    executionTime?: number; // milliseconds
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    cpuUsage: {
      user: number;
      system: number;
    };
    networkRequests: number;
    screenshotsTaken: number;
    elementsInteracted: number;
    pagesVisited: number;
  };
  
  // Agent Communication
  communication: {
    messagesReceived: number;
    messagesSent: number;
    lastHeartbeat: Date;
    coordinatorId?: string;
    peerAgents: Array<{
      agentType: AgentType;
      sessionId: string;
      status: AgentStatus;
      lastCommunication: Date;
    }>;
  };
  
  // Error Handling & Recovery
  errorHandling: {
    errorCount: number;
    lastError?: {
      message: string;
      stack: string;
      timestamp: Date;
      recoveryAttempted: boolean;
      recoverySuccessful?: boolean;
    };
    recoveryStrategies: Array<{
      strategy: string;
      attempted: Date;
      successful: boolean;
      details: Record<string, any>;
    }>;
  };
  
  // Agent Learning & Adaptation
  learning: {
    successfulActions: Array<{
      action: string;
      selector: string;
      context: Record<string, any>;
      timestamp: Date;
    }>;
    failedActions: Array<{
      action: string;
      selector: string;
      error: string;
      timestamp: Date;
    }>;
    adaptations: Array<{
      type: string;
      reason: string;
      change: Record<string, any>;
      timestamp: Date;
    }>;
  };
  
  // Security & Compliance
  security: {
    encryptedData: boolean;
    dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
    accessLog: Array<{
      action: string;
      timestamp: Date;
      ipAddress: string;
      userAgent: string;
    }>;
    complianceFlags: Array<{
      regulation: string; // GDPR, CCPA, etc.
      status: 'compliant' | 'violation' | 'review_required';
      details: string;
    }>;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const AgentSessionSchema = new Schema<IAgentSessionDocument>({
  taskId: {
    type: String,
    required: true,
    index: true,
  },
  agentType: {
    type: String,
    enum: Object.values(AgentType),
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(AgentStatus),
    required: true,
    index: true,
  },
  currentStep: {
    type: String,
    required: true,
  },
  
  // Agent Context & State
  context: {
    sessionId: { type: String, required: true, unique: true },
    browserId: String,
    pageUrl: String,
    viewport: {
      width: { type: Number, default: 1920 },
      height: { type: Number, default: 1080 },
    },
    userAgent: { type: String, required: true },
    cookies: [{
      name: String,
      value: String,
      domain: String,
      path: String,
      expires: Date,
    }],
    localStorage: { type: Schema.Types.Mixed, default: {} },
    sessionStorage: { type: Schema.Types.Mixed, default: {} },
  },
  
  // Performance Metrics
  metrics: {
    startTime: { type: Date, required: true, default: Date.now },
    endTime: Date,
    executionTime: Number,
    memoryUsage: {
      heapUsed: { type: Number, default: 0 },
      heapTotal: { type: Number, default: 0 },
      external: { type: Number, default: 0 },
      rss: { type: Number, default: 0 },
    },
    cpuUsage: {
      user: { type: Number, default: 0 },
      system: { type: Number, default: 0 },
    },
    networkRequests: { type: Number, default: 0 },
    screenshotsTaken: { type: Number, default: 0 },
    elementsInteracted: { type: Number, default: 0 },
    pagesVisited: { type: Number, default: 0 },
  },
  
  // Agent Communication
  communication: {
    messagesReceived: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    lastHeartbeat: { type: Date, default: Date.now },
    coordinatorId: String,
    peerAgents: [{
      agentType: {
        type: String,
        enum: Object.values(AgentType),
      },
      sessionId: String,
      status: {
        type: String,
        enum: Object.values(AgentStatus),
      },
      lastCommunication: Date,
    }],
  },
  
  // Error Handling & Recovery
  errorHandling: {
    errorCount: { type: Number, default: 0 },
    lastError: {
      message: String,
      stack: String,
      timestamp: Date,
      recoveryAttempted: { type: Boolean, default: false },
      recoverySuccessful: Boolean,
    },
    recoveryStrategies: [{
      strategy: String,
      attempted: Date,
      successful: Boolean,
      details: Schema.Types.Mixed,
    }],
  },
  
  // Agent Learning & Adaptation
  learning: {
    successfulActions: [{
      action: String,
      selector: String,
      context: Schema.Types.Mixed,
      timestamp: Date,
    }],
    failedActions: [{
      action: String,
      selector: String,
      error: String,
      timestamp: Date,
    }],
    adaptations: [{
      type: String,
      reason: String,
      change: Schema.Types.Mixed,
      timestamp: Date,
    }],
  },
  
  // Security & Compliance
  security: {
    encryptedData: { type: Boolean, default: true },
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal',
    },
    accessLog: [{
      action: String,
      timestamp: Date,
      ipAddress: String,
      userAgent: String,
    }],
    complianceFlags: [{
      regulation: String,
      status: {
        type: String,
        enum: ['compliant', 'violation', 'review_required'],
      },
      details: String,
    }],
  },
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

AgentSessionSchema.index({ taskId: 1, agentType: 1 });
AgentSessionSchema.index({ status: 1, agentType: 1 });
AgentSessionSchema.index({ 'context.sessionId': 1 });
AgentSessionSchema.index({ createdAt: -1 });
AgentSessionSchema.index({ 'metrics.startTime': -1 });
AgentSessionSchema.index({ 'communication.lastHeartbeat': -1 });

// Compound indexes for common queries
AgentSessionSchema.index({ taskId: 1, status: 1, agentType: 1 });
AgentSessionSchema.index({ agentType: 1, status: 1, createdAt: -1 });

// =============================================================================
// METHODS
// =============================================================================

AgentSessionSchema.methods.updateMetrics = function(metrics: Partial<IAgentSessionDocument['metrics']>) {
  Object.assign(this.metrics, metrics);
  return this.save();
};

AgentSessionSchema.methods.recordError = function(error: Error) {
  this.errorHandling.errorCount += 1;
  this.errorHandling.lastError = {
    message: error.message,
    stack: error.stack || '',
    timestamp: new Date(),
    recoveryAttempted: false,
  };
  return this.save();
};

AgentSessionSchema.methods.recordSuccessfulAction = function(action: string, selector: string, context: Record<string, any>) {
  this.learning.successfulActions.push({
    action,
    selector,
    context,
    timestamp: new Date(),
  });
  
  // Keep only last 100 successful actions
  if (this.learning.successfulActions.length > 100) {
    this.learning.successfulActions = this.learning.successfulActions.slice(-100);
  }
  
  return this.save();
};

AgentSessionSchema.methods.recordFailedAction = function(action: string, selector: string, error: string) {
  this.learning.failedActions.push({
    action,
    selector,
    error,
    timestamp: new Date(),
  });
  
  // Keep only last 50 failed actions
  if (this.learning.failedActions.length > 50) {
    this.learning.failedActions = this.learning.failedActions.slice(-50);
  }
  
  return this.save();
};

AgentSessionSchema.methods.heartbeat = function() {
  this.communication.lastHeartbeat = new Date();
  return this.save();
};

AgentSessionSchema.methods.addPeerAgent = function(agentType: AgentType, sessionId: string, status: AgentStatus) {
  const existingPeer = this.communication.peerAgents.find(peer => peer.sessionId === sessionId);
  
  if (existingPeer) {
    existingPeer.status = status;
    existingPeer.lastCommunication = new Date();
  } else {
    this.communication.peerAgents.push({
      agentType,
      sessionId,
      status,
      lastCommunication: new Date(),
    });
  }
  
  return this.save();
};

AgentSessionSchema.methods.complete = function() {
  this.status = AgentStatus.COMPLETED;
  this.metrics.endTime = new Date();
  this.metrics.executionTime = this.metrics.endTime.getTime() - this.metrics.startTime.getTime();
  return this.save();
};

// =============================================================================
// STATIC METHODS
// =============================================================================

AgentSessionSchema.statics.findActiveByTask = function(taskId: string) {
  return this.find({
    taskId,
    status: { $in: [AgentStatus.ACTIVE, AgentStatus.BUSY] },
  });
};

AgentSessionSchema.statics.findByAgentType = function(agentType: AgentType, limit = 50) {
  return this.find({ agentType })
    .sort({ createdAt: -1 })
    .limit(limit);
};

AgentSessionSchema.statics.getPerformanceStats = function(agentType?: AgentType) {
  const match = agentType ? { agentType } : {};
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$agentType',
        avgExecutionTime: { $avg: '$metrics.executionTime' },
        totalSessions: { $sum: 1 },
        successRate: {
          $avg: {
            $cond: [
              { $eq: ['$status', AgentStatus.COMPLETED] },
              1,
              0
            ]
          }
        },
        avgMemoryUsage: { $avg: '$metrics.memoryUsage.heapUsed' },
        avgNetworkRequests: { $avg: '$metrics.networkRequests' },
      }
    }
  ]);
};

AgentSessionSchema.statics.cleanupStaleHeartbeats = function(timeoutMs = 300000) { // 5 minutes
  const cutoff = new Date(Date.now() - timeoutMs);
  
  return this.updateMany(
    {
      'communication.lastHeartbeat': { $lt: cutoff },
      status: { $in: [AgentStatus.ACTIVE, AgentStatus.BUSY] },
    },
    {
      $set: { status: AgentStatus.TIMEOUT },
    }
  );
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

AgentSessionSchema.pre('save', function(next) {
  // Auto-update execution time if session is completed
  if (this.isModified('status') && this.status === AgentStatus.COMPLETED && !this.metrics.endTime) {
    this.metrics.endTime = new Date();
    this.metrics.executionTime = this.metrics.endTime.getTime() - this.metrics.startTime.getTime();
  }
  
  // Update heartbeat on any save
  if (!this.isNew) {
    this.communication.lastHeartbeat = new Date();
  }
  
  next();
});

export const AgentSession = mongoose.model<IAgentSessionDocument>('AgentSession', AgentSessionSchema);