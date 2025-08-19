import { z } from 'zod';
export declare enum AgentType {
    PLANNER = "planner",
    NAVIGATOR = "navigator",
    EXTRACTOR = "extractor",
    VERIFIER = "verifier",
    COORDINATOR = "coordinator"
}
export declare enum AgentStatus {
    IDLE = "idle",
    BUSY = "busy",
    ERROR = "error",
    OFFLINE = "offline"
}
export declare enum TaskStatus {
    PENDING = "pending",
    RUNNING = "running",
    PAUSED = "paused",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export declare enum TaskType {
    JOB_SEARCH = "job_search",
    JOB_APPLICATION = "job_application",
    COMPANY_RESEARCH = "company_research",
    CONTACT_SCRAPING = "contact_scraping",
    DATA_EXTRACTION = "data_extraction",
    FORM_FILLING = "form_filling",
    CUSTOM_WORKFLOW = "custom_workflow"
}
export declare enum TaskPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    URGENT = "urgent"
}
export declare const AgentConfigSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof AgentType>;
    name: z.ZodString;
    description: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    maxConcurrentTasks: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
    retryAttempts: z.ZodDefault<z.ZodNumber>;
    capabilities: z.ZodArray<z.ZodString, "many">;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: AgentType;
    timeout: number;
    name: string;
    id: string;
    description: string;
    retryAttempts: number;
    enabled: boolean;
    maxConcurrentTasks: number;
    capabilities: string[];
    metadata?: Record<string, any> | undefined;
}, {
    type: AgentType;
    name: string;
    id: string;
    description: string;
    capabilities: string[];
    timeout?: number | undefined;
    metadata?: Record<string, any> | undefined;
    retryAttempts?: number | undefined;
    enabled?: boolean | undefined;
    maxConcurrentTasks?: number | undefined;
}>;
export declare const AgentStatusSchema: z.ZodObject<{
    agentId: z.ZodString;
    type: z.ZodNativeEnum<typeof AgentType>;
    status: z.ZodNativeEnum<typeof AgentStatus>;
    currentTasks: z.ZodArray<z.ZodString, "many">;
    completedTasks: z.ZodDefault<z.ZodNumber>;
    failedTasks: z.ZodDefault<z.ZodNumber>;
    uptime: z.ZodNumber;
    lastHeartbeat: z.ZodDate;
    performance: z.ZodObject<{
        averageTaskTime: z.ZodNumber;
        successRate: z.ZodNumber;
        throughput: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        successRate: number;
        averageTaskTime: number;
        throughput: number;
    }, {
        successRate: number;
        averageTaskTime: number;
        throughput: number;
    }>;
}, "strip", z.ZodTypeAny, {
    type: AgentType;
    status: AgentStatus;
    agentId: string;
    currentTasks: string[];
    completedTasks: number;
    failedTasks: number;
    uptime: number;
    lastHeartbeat: Date;
    performance: {
        successRate: number;
        averageTaskTime: number;
        throughput: number;
    };
}, {
    type: AgentType;
    status: AgentStatus;
    agentId: string;
    currentTasks: string[];
    uptime: number;
    lastHeartbeat: Date;
    performance: {
        successRate: number;
        averageTaskTime: number;
        throughput: number;
    };
    completedTasks?: number | undefined;
    failedTasks?: number | undefined;
}>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof TaskType>;
    status: z.ZodNativeEnum<typeof TaskStatus>;
    priority: z.ZodDefault<z.ZodNativeEnum<typeof TaskPriority>>;
    userId: z.ZodString;
    assignedAgents: z.ZodArray<z.ZodNativeEnum<typeof AgentType>, "many">;
    command: z.ZodString;
    parameters: z.ZodRecord<z.ZodString, z.ZodAny>;
    progress: z.ZodObject<{
        percentage: z.ZodDefault<z.ZodNumber>;
        currentStep: z.ZodString;
        totalSteps: z.ZodNumber;
        estimatedTimeLeft: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        percentage: number;
        currentStep: string;
        totalSteps: number;
        estimatedTimeLeft?: number | undefined;
    }, {
        currentStep: string;
        totalSteps: number;
        percentage?: number | undefined;
        estimatedTimeLeft?: number | undefined;
    }>;
    results: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    startedAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: TaskType;
    status: TaskStatus;
    timeout: number;
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    parameters: Record<string, any>;
    priority: TaskPriority;
    progress: {
        percentage: number;
        currentStep: string;
        totalSteps: number;
        estimatedTimeLeft?: number | undefined;
    };
    assignedAgents: AgentType[];
    command: string;
    error?: string | undefined;
    results?: Record<string, any> | undefined;
    startedAt?: Date | undefined;
    completedAt?: Date | undefined;
}, {
    type: TaskType;
    status: TaskStatus;
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    parameters: Record<string, any>;
    progress: {
        currentStep: string;
        totalSteps: number;
        percentage?: number | undefined;
        estimatedTimeLeft?: number | undefined;
    };
    assignedAgents: AgentType[];
    command: string;
    timeout?: number | undefined;
    error?: string | undefined;
    priority?: TaskPriority | undefined;
    results?: Record<string, any> | undefined;
    startedAt?: Date | undefined;
    completedAt?: Date | undefined;
}>;
export declare const AgentMessageSchema: z.ZodObject<{
    id: z.ZodString;
    fromAgent: z.ZodNativeEnum<typeof AgentType>;
    toAgent: z.ZodOptional<z.ZodNativeEnum<typeof AgentType>>;
    taskId: z.ZodString;
    type: z.ZodEnum<["command", "response", "error", "heartbeat", "coordination"]>;
    payload: z.ZodRecord<z.ZodString, z.ZodAny>;
    timestamp: z.ZodDate;
    priority: z.ZodDefault<z.ZodNativeEnum<typeof TaskPriority>>;
}, "strip", z.ZodTypeAny, {
    type: "error" | "command" | "response" | "heartbeat" | "coordination";
    timestamp: Date;
    id: string;
    payload: Record<string, any>;
    priority: TaskPriority;
    taskId: string;
    fromAgent: AgentType;
    toAgent?: AgentType | undefined;
}, {
    type: "error" | "command" | "response" | "heartbeat" | "coordination";
    timestamp: Date;
    id: string;
    payload: Record<string, any>;
    taskId: string;
    fromAgent: AgentType;
    priority?: TaskPriority | undefined;
    toAgent?: AgentType | undefined;
}>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentStatusType = z.infer<typeof AgentStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
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
    checkDataQuality(data: any): Promise<number>;
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
//# sourceMappingURL=agent.d.ts.map