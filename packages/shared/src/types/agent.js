"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentMessageSchema = exports.TaskSchema = exports.AgentStatusSchema = exports.AgentConfigSchema = exports.TaskPriority = exports.TaskType = exports.TaskStatus = exports.AgentStatus = exports.AgentType = void 0;
const zod_1 = require("zod");
var AgentType;
(function (AgentType) {
    AgentType["PLANNER"] = "planner";
    AgentType["NAVIGATOR"] = "navigator";
    AgentType["EXTRACTOR"] = "extractor";
    AgentType["VERIFIER"] = "verifier";
    AgentType["COORDINATOR"] = "coordinator";
})(AgentType || (exports.AgentType = AgentType = {}));
var AgentStatus;
(function (AgentStatus) {
    AgentStatus["IDLE"] = "idle";
    AgentStatus["BUSY"] = "busy";
    AgentStatus["ERROR"] = "error";
    AgentStatus["OFFLINE"] = "offline";
})(AgentStatus || (exports.AgentStatus = AgentStatus = {}));
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["RUNNING"] = "running";
    TaskStatus["PAUSED"] = "paused";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
    TaskStatus["CANCELLED"] = "cancelled";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var TaskType;
(function (TaskType) {
    TaskType["JOB_SEARCH"] = "job_search";
    TaskType["JOB_APPLICATION"] = "job_application";
    TaskType["COMPANY_RESEARCH"] = "company_research";
    TaskType["CONTACT_SCRAPING"] = "contact_scraping";
    TaskType["DATA_EXTRACTION"] = "data_extraction";
    TaskType["FORM_FILLING"] = "form_filling";
    TaskType["CUSTOM_WORKFLOW"] = "custom_workflow";
})(TaskType || (exports.TaskType = TaskType = {}));
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["LOW"] = "low";
    TaskPriority["MEDIUM"] = "medium";
    TaskPriority["HIGH"] = "high";
    TaskPriority["URGENT"] = "urgent";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
exports.AgentConfigSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(AgentType),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    enabled: zod_1.z.boolean().default(true),
    maxConcurrentTasks: zod_1.z.number().min(1).max(100).default(5),
    timeout: zod_1.z.number().min(1000).default(300000),
    retryAttempts: zod_1.z.number().min(0).max(10).default(3),
    capabilities: zod_1.z.array(zod_1.z.string()),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
exports.AgentStatusSchema = zod_1.z.object({
    agentId: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(AgentType),
    status: zod_1.z.nativeEnum(AgentStatus),
    currentTasks: zod_1.z.array(zod_1.z.string().uuid()),
    completedTasks: zod_1.z.number().min(0).default(0),
    failedTasks: zod_1.z.number().min(0).default(0),
    uptime: zod_1.z.number().min(0),
    lastHeartbeat: zod_1.z.date(),
    performance: zod_1.z.object({
        averageTaskTime: zod_1.z.number().min(0),
        successRate: zod_1.z.number().min(0).max(100),
        throughput: zod_1.z.number().min(0),
    }),
});
exports.TaskSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(TaskType),
    status: zod_1.z.nativeEnum(TaskStatus),
    priority: zod_1.z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
    userId: zod_1.z.string().uuid(),
    assignedAgents: zod_1.z.array(zod_1.z.nativeEnum(AgentType)),
    command: zod_1.z.string().min(1),
    parameters: zod_1.z.record(zod_1.z.any()),
    progress: zod_1.z.object({
        percentage: zod_1.z.number().min(0).max(100).default(0),
        currentStep: zod_1.z.string(),
        totalSteps: zod_1.z.number().min(1),
        estimatedTimeLeft: zod_1.z.number().min(0).optional(),
    }),
    results: zod_1.z.record(zod_1.z.any()).optional(),
    error: zod_1.z.string().optional(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
    startedAt: zod_1.z.date().optional(),
    completedAt: zod_1.z.date().optional(),
    timeout: zod_1.z.number().min(1000).default(300000),
});
exports.AgentMessageSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    fromAgent: zod_1.z.nativeEnum(AgentType),
    toAgent: zod_1.z.nativeEnum(AgentType).optional(),
    taskId: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['command', 'response', 'error', 'heartbeat', 'coordination']),
    payload: zod_1.z.record(zod_1.z.any()),
    timestamp: zod_1.z.date(),
    priority: zod_1.z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
});
//# sourceMappingURL=agent.js.map