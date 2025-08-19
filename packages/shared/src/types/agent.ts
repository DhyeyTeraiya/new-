import { z } from 'zod';

// =============================================================================
// MULTI-AGENT SYSTEM TYPES (Superior to Manus 3-Agent Architecture)
// =============================================================================

export enum AgentType {
  PLANNER = 'planner',
  NAVIGATOR = 'navigator',
  EXTRACTOR = 'extractor',
  VERIFIER = 'verifier',
  COORDINATOR = 'coordinator', // 5th agent - Superior to Manus
}

export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  OFFLINE = 'offline',
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskType {
  JOB_SEARCH = 'job_search',
  JOB_APPLICATION = 'job_application',
  COMPANY_RESEARCH = 'company_research',
  CONTACT_SCRAPING = 'contact_scraping',
  DATA_EXTRACTION = 'data_extraction',
  FORM_FILLING = 'form_filling',
  CUSTOM_WORKFLOW = 'custom_workflow',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

// =============================================================================
// AGENT SCHEMAS
// =============================================================================

export const AgentConfigSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(AgentType),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(true),
  maxConcurrentTasks: z.number().min(1).max(100).default(5),
  timeout: z.number().min(1000).default(300000), // 5 minutes
  retryAttempts: z.number().min(0).max(10).default(3),
  capabilities: z.array(z.string()),
  metadata: z.record(z.any()).optional(),
});

export const AgentStatusSchema = z.object({
  agentId: z.string().uuid(),
  type: z.nativeEnum(AgentType),
  status: z.nativeEnum(AgentStatus),
  currentTasks: z.array(z.string().uuid()),
  completedTasks: z.number().min(0).default(0),
  failedTasks: z.number().min(0).default(0),
  uptime: z.number().min(0),
  lastHeartbeat: z.date(),
  performance: z.object({
    averageTaskTime: z.number().min(0),
    successRate: z.number().min(0).max(100),
    throughput: z.number().min(0),
  }),
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(TaskType),
  status: z.nativeEnum(TaskStatus),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  userId: z.string().uuid(),
  assignedAgents: z.array(z.nativeEnum(AgentType)),
  command: z.string().min(1),
  parameters: z.record(z.any()),
  progress: z.object({
    percentage: z.number().min(0).max(100).default(0),
    currentStep: z.string(),
    totalSteps: z.number().min(1),
    estimatedTimeLeft: z.number().min(0).optional(),
  }),
  results: z.record(z.any()).optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  timeout: z.number().min(1000).default(300000),
});

export const AgentMessageSchema = z.object({
  id: z.string().uuid(),
  fromAgent: z.nativeEnum(AgentType),
  toAgent: z.nativeEnum(AgentType).optional(),
  taskId: z.string().uuid(),
  type: z.enum(['command', 'response', 'error', 'heartbeat', 'coordination']),
  payload: z.record(z.any()),
  timestamp: z.date(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentStatusType = z.infer<typeof AgentStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

// =============================================================================
// AGENT INTERFACES
// =============================================================================

export interface IAgent {
  id: string;
  type: AgentType;
  config: AgentConfig;
  status: AgentStatusType;
  
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  executeTask(task: Task): Promise<any>;
  sendMessage(message: AgentMessage): Promise<void>;
  receiveMessage(message: AgentMessage): Promise<void>;
  getStatus(): AgentStatusType;
  updateStatus(status: Partial<AgentStatusType>): void;
}

export interface IAgentCoordinator {
  registerAgent(agent: IAgent): void;
  unregisterAgent(agentId: string): void;
  assignTask(task: Task): Promise<void>;
  redistributeTask(taskId: string): Promise<void>;
  getAgentStatus(agentId: string): AgentStatusType | null;
  getAllAgentsStatus(): AgentStatusType[];
  broadcastMessage(message: AgentMessage): Promise<void>;
  sendMessage(agentId: string, message: AgentMessage): Promise<void>;
}

// =============================================================================
// SPECIALIZED AGENT INTERFACES
// =============================================================================

export interface IPlannerAgent extends IAgent {
  parseCommand(command: string): Promise<Task>;
  createExecutionPlan(task: Task): Promise<any>;
  optimizePlan(plan: any): Promise<any>;
  validatePlan(plan: any): Promise<boolean>;
}

export interface INavigatorAgent extends IAgent {
  navigateToUrl(url: string): Promise<void>;
  clickElement(selector: string): Promise<void>;
  fillForm(formData: Record<string, any>): Promise<void>;
  scrollPage(direction: 'up' | 'down', amount?: number): Promise<void>;
  takeScreenshot(): Promise<Buffer>;
  waitForElement(selector: string, timeout?: number): Promise<void>;
}

export interface IExtractorAgent extends IAgent {
  extractData(selectors: Record<string, string>): Promise<Record<string, any>>;
  extractText(selector: string): Promise<string>;
  extractLinks(selector?: string): Promise<string[]>;
  extractImages(selector?: string): Promise<string[]>;
  extractTable(selector: string): Promise<any[]>;
  validateExtractedData(data: any, schema: z.ZodSchema): Promise<boolean>;
}

export interface IVerifierAgent extends IAgent {
  verifyTaskCompletion(task: Task, results: any): Promise<boolean>;
  validateData(data: any, schema: z.ZodSchema): Promise<boolean>;
  checkDataQuality(data: any): Promise<number>; // Quality score 0-100
  detectErrors(results: any): Promise<string[]>;
  suggestCorrections(errors: string[]): Promise<string[]>;
}

export interface ICoordinatorAgent extends IAgent {
  coordinateAgents(agents: IAgent[]): Promise<void>;
  balanceWorkload(tasks: Task[]): Promise<void>;
  monitorPerformance(): Promise<void>;
  handleFailures(failedTasks: Task[]): Promise<void>;
  optimizeResourceAllocation(): Promise<void>;
}