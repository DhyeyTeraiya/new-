import { logger } from '../../utils/logger';
import { TaskType, AgentType } from '../../../../../packages/shared/src/types/agent';

// =============================================================================
// MULTI-MODEL ROUTING SYSTEM (Superior to Manus Claude+Qwen)
// Based on Master Plan Section 5 & 6
// =============================================================================

export enum AIModel {
  // Main Brain - Planning & Decomposition
  LLAMA_3_70B = 'nvidia/llama-3-70b-instruct',
  
  // Fast Executor - Navigation & Forms
  MISTRAL_7B = 'nvidia/mistral-7b-instruct',
  
  // Retriever - RAG & Facts
  NEMO_RETRIEVER = 'nvidia/nemo-retriever',
  
  // Summarizer - Reports & Formatting
  MIXTRAL_8X7B = 'nvidia/mixtral-8x7b-instruct',
  LLAMA_3_8B = 'nvidia/llama-3-8b-instruct',
  
  // Code Generation
  DEEPSEEK_CODER = 'deepseek/deepseek-coder-33b-instruct',
  CODE_LLAMA = 'nvidia/code-llama-34b-instruct',
  
  // External Models (Fallback)
  CLAUDE_3_5_SONNET = 'anthropic/claude-3-5-sonnet',
  GPT_4O = 'openai/gpt-4o',
  GEMINI_PRO = 'google/gemini-pro',
}

export interface ModelCapabilities {
  planning: number; // 0-100 capability score
  navigation: number;
  extraction: number;
  reasoning: number;
  coding: number;
  summarization: number;
  speed: number; // tokens per second
  cost: number; // cost per 1k tokens
  context_length: number;
  reliability: number;
}

export interface RouteDecision {
  model: AIModel;
  reasoning: string;
  confidence: number;
  estimated_cost: number;
  estimated_time: number;
  fallback_models: AIModel[];
}

export interface TaskContext {
  type: TaskType;
  agent_type?: AgentType;
  complexity: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  user_tier: 'free' | 'premium' | 'enterprise';
  budget_limit?: number; // USD
  time_limit?: number; // seconds
  previous_failures?: string[];
  context_size?: number; // estimated tokens
}

// =============================================================================
// MODEL CAPABILITIES DATABASE
// =============================================================================

const MODEL_CAPABILITIES: Record<AIModel, ModelCapabilities> = {
  [AIModel.LLAMA_3_70B]: {
    planning: 95,
    navigation: 70,
    extraction: 80,
    reasoning: 95,
    coding: 85,
    summarization: 90,
    speed: 20, // tokens/sec
    cost: 0.008, // per 1k tokens
    context_length: 8192,
    reliability: 95,
  },
  [AIModel.MISTRAL_7B]: {
    planning: 70,
    navigation: 90,
    extraction: 85,
    reasoning: 75,
    coding: 80,
    summarization: 70,
    speed: 80, // tokens/sec
    cost: 0.0015, // per 1k tokens
    context_length: 32768,
    reliability: 90,
  },
  [AIModel.NEMO_RETRIEVER]: {
    planning: 60,
    navigation: 40,
    extraction: 95,
    reasoning: 70,
    coding: 30,
    summarization: 60,
    speed: 100, // tokens/sec
    cost: 0.001, // per 1k tokens
    context_length: 4096,
    reliability: 95,
  },
  [AIModel.MIXTRAL_8X7B]: {
    planning: 85,
    navigation: 75,
    extraction: 80,
    reasoning: 90,
    coding: 85,
    summarization: 95,
    speed: 40, // tokens/sec
    cost: 0.006, // per 1k tokens
    context_length: 32768,
    reliability: 92,
  },
  [AIModel.LLAMA_3_8B]: {
    planning: 75,
    navigation: 80,
    extraction: 85,
    reasoning: 80,
    coding: 75,
    summarization: 90,
    speed: 60, // tokens/sec
    cost: 0.002, // per 1k tokens
    context_length: 8192,
    reliability: 88,
  },
  [AIModel.DEEPSEEK_CODER]: {
    planning: 70,
    navigation: 85,
    extraction: 75,
    reasoning: 80,
    coding: 98,
    summarization: 60,
    speed: 50, // tokens/sec
    cost: 0.004, // per 1k tokens
    context_length: 16384,
    reliability: 90,
  },
  [AIModel.CODE_LLAMA]: {
    planning: 65,
    navigation: 80,
    extraction: 70,
    reasoning: 75,
    coding: 95,
    summarization: 55,
    speed: 45, // tokens/sec
    cost: 0.005, // per 1k tokens
    context_length: 16384,
    reliability: 88,
  },
  [AIModel.CLAUDE_3_5_SONNET]: {
    planning: 92,
    navigation: 85,
    extraction: 90,
    reasoning: 95,
    coding: 90,
    summarization: 95,
    speed: 30, // tokens/sec
    cost: 0.015, // per 1k tokens
    context_length: 200000,
    reliability: 96,
  },
  [AIModel.GPT_4O]: {
    planning: 90,
    navigation: 80,
    extraction: 85,
    reasoning: 92,
    coding: 88,
    summarization: 90,
    speed: 25, // tokens/sec
    cost: 0.03, // per 1k tokens
    context_length: 128000,
    reliability: 94,
  },
  [AIModel.GEMINI_PRO]: {
    planning: 85,
    navigation: 75,
    extraction: 80,
    reasoning: 88,
    coding: 82,
    summarization: 85,
    speed: 35, // tokens/sec
    cost: 0.0025, // per 1k tokens
    context_length: 32768,
    reliability: 90,
  },
};

// =============================================================================
// INTELLIGENT MODEL ROUTER
// =============================================================================

export class ModelRouter {
  private static instance: ModelRouter;
  private routingHistory: Map<string, RouteDecision[]> = new Map();
  private performanceMetrics: Map<AIModel, { success_rate: number; avg_time: number; avg_cost: number }> = new Map();

  private constructor() {
    this.initializeMetrics();
  }

  public static getInstance(): ModelRouter {
    if (!ModelRouter.instance) {
      ModelRouter.instance = new ModelRouter();
    }
    return ModelRouter.instance;
  }

  /**
   * Main routing logic based on Master Plan Section 6
   */
  public routeTask(context: TaskContext): RouteDecision {
    logger.info('Routing task', { context });

    // Apply Master Plan routing logic
    const primaryModel = this.selectPrimaryModel(context);
    const fallbackModels = this.selectFallbackModels(primaryModel, context);
    
    const capabilities = MODEL_CAPABILITIES[primaryModel];
    const estimatedTokens = this.estimateTokenUsage(context);
    
    const decision: RouteDecision = {
      model: primaryModel,
      reasoning: this.generateRoutingReasoning(context, primaryModel),
      confidence: this.calculateConfidence(context, primaryModel),
      estimated_cost: (estimatedTokens / 1000) * capabilities.cost,
      estimated_time: estimatedTokens / capabilities.speed,
      fallback_models: fallbackModels,
    };

    // Store routing decision for learning
    this.storeRoutingDecision(context, decision);
    
    logger.info('Model routing decision', decision);
    return decision;
  }

  /**
   * Master Plan Section 6: Model Selection Logic
   */
  private selectPrimaryModel(context: TaskContext): AIModel {
    // Master Plan Pseudocode Implementation:
    
    // if task.is_navigation_or_form(): use(Mistral7B)
    if (this.isNavigationOrForm(context)) {
      return AIModel.MISTRAL_7B;
    }
    
    // elif task.is_planning_or_multi_step(): use(Llama3_70B)
    if (this.isPlanningOrMultiStep(context)) {
      return AIModel.LLAMA_3_70B;
    }
    
    // elif task.is_factual_retrieval(): use(NeMoRetriever)
    if (this.isFactualRetrieval(context)) {
      return AIModel.NEMO_RETRIEVER;
    }
    
    // elif task.is_code_generation(): use(DeepSeekCoder or CodeLlama)
    if (this.isCodeGeneration(context)) {
      return context.complexity === 'high' ? AIModel.DEEPSEEK_CODER : AIModel.CODE_LLAMA;
    }
    
    // elif task.is_summary_or_report(): use(Llama3_8B or Mixtral8x7B)
    if (this.isSummaryOrReport(context)) {
      return context.complexity === 'high' ? AIModel.MIXTRAL_8X7B : AIModel.LLAMA_3_8B;
    }

    // Advanced routing based on context
    return this.selectAdvancedModel(context);
  }

  /**
   * Task type classification methods
   */
  private isNavigationOrForm(context: TaskContext): boolean {
    return (
      context.agent_type === AgentType.NAVIGATOR ||
      context.type === TaskType.FORM_FILLING ||
      (context.type === TaskType.JOB_APPLICATION && context.complexity === 'low')
    );
  }

  private isPlanningOrMultiStep(context: TaskContext): boolean {
    return (
      context.agent_type === AgentType.PLANNER ||
      context.complexity === 'high' ||
      context.type === TaskType.CUSTOM_WORKFLOW ||
      (context.type === TaskType.COMPANY_RESEARCH && context.complexity === 'high')
    );
  }

  private isFactualRetrieval(context: TaskContext): boolean {
    return (
      context.agent_type === AgentType.EXTRACTOR ||
      context.type === TaskType.DATA_EXTRACTION ||
      context.type === TaskType.CONTACT_SCRAPING ||
      (context.type === TaskType.COMPANY_RESEARCH && context.complexity === 'low')
    );
  }

  private isCodeGeneration(context: TaskContext): boolean {
    return (
      context.type === TaskType.CUSTOM_WORKFLOW ||
      (context.agent_type === AgentType.NAVIGATOR && context.complexity === 'high')
    );
  }

  private isSummaryOrReport(context: TaskContext): boolean {
    return (
      context.agent_type === AgentType.VERIFIER ||
      context.type === TaskType.COMPANY_RESEARCH ||
      (context.type === TaskType.JOB_SEARCH && context.complexity === 'medium')
    );
  }

  /**
   * Advanced model selection for edge cases
   */
  private selectAdvancedModel(context: TaskContext): AIModel {
    // Budget-based selection
    if (context.budget_limit && context.budget_limit < 0.01) {
      return AIModel.MISTRAL_7B; // Cheapest option
    }

    // Time-critical selection
    if (context.time_limit && context.time_limit < 30) {
      return AIModel.NEMO_RETRIEVER; // Fastest option
    }

    // User tier-based selection
    if (context.user_tier === 'enterprise') {
      return AIModel.CLAUDE_3_5_SONNET; // Premium model
    }

    // Priority-based selection
    if (context.priority === 'urgent') {
      return AIModel.MISTRAL_7B; // Fast and reliable
    }

    // Fallback to balanced option
    return AIModel.LLAMA_3_8B;
  }

  /**
   * Select fallback models for reliability
   */
  private selectFallbackModels(primaryModel: AIModel, context: TaskContext): AIModel[] {
    const fallbacks: AIModel[] = [];
    
    // Always include a fast fallback
    if (primaryModel !== AIModel.MISTRAL_7B) {
      fallbacks.push(AIModel.MISTRAL_7B);
    }
    
    // Include a premium fallback for important tasks
    if (context.priority === 'high' || context.priority === 'urgent') {
      if (primaryModel !== AIModel.CLAUDE_3_5_SONNET) {
        fallbacks.push(AIModel.CLAUDE_3_5_SONNET);
      }
    }
    
    // Include a balanced fallback
    if (primaryModel !== AIModel.LLAMA_3_8B && !fallbacks.includes(AIModel.LLAMA_3_8B)) {
      fallbacks.push(AIModel.LLAMA_3_8B);
    }

    return fallbacks.slice(0, 2); // Limit to 2 fallbacks
  }

  /**
   * Generate human-readable routing reasoning
   */
  private generateRoutingReasoning(context: TaskContext, model: AIModel): string {
    const capabilities = MODEL_CAPABILITIES[model];
    const reasons: string[] = [];

    if (this.isNavigationOrForm(context)) {
      reasons.push(`Selected ${model} for navigation/form tasks (navigation score: ${capabilities.navigation})`);
    } else if (this.isPlanningOrMultiStep(context)) {
      reasons.push(`Selected ${model} for complex planning (planning score: ${capabilities.planning})`);
    } else if (this.isFactualRetrieval(context)) {
      reasons.push(`Selected ${model} for data extraction (extraction score: ${capabilities.extraction})`);
    }

    if (context.priority === 'urgent') {
      reasons.push(`High speed required (${capabilities.speed} tokens/sec)`);
    }

    if (context.budget_limit) {
      reasons.push(`Cost-effective choice ($${capabilities.cost}/1k tokens)`);
    }

    return reasons.join('; ') || `Best match for ${context.type} task`;
  }

  /**
   * Calculate confidence score for routing decision
   */
  private calculateConfidence(context: TaskContext, model: AIModel): number {
    const capabilities = MODEL_CAPABILITIES[model];
    let confidence = 0;

    // Base confidence on capability match
    if (this.isNavigationOrForm(context)) {
      confidence = capabilities.navigation;
    } else if (this.isPlanningOrMultiStep(context)) {
      confidence = capabilities.planning;
    } else if (this.isFactualRetrieval(context)) {
      confidence = capabilities.extraction;
    } else if (this.isCodeGeneration(context)) {
      confidence = capabilities.coding;
    } else if (this.isSummaryOrReport(context)) {
      confidence = capabilities.summarization;
    } else {
      confidence = capabilities.reasoning;
    }

    // Adjust for reliability
    confidence = (confidence + capabilities.reliability) / 2;

    // Adjust for historical performance
    const metrics = this.performanceMetrics.get(model);
    if (metrics) {
      confidence = (confidence + metrics.success_rate) / 2;
    }

    return Math.round(confidence);
  }

  /**
   * Estimate token usage for cost calculation
   */
  private estimateTokenUsage(context: TaskContext): number {
    const baseTokens = {
      [TaskType.JOB_SEARCH]: 500,
      [TaskType.JOB_APPLICATION]: 800,
      [TaskType.COMPANY_RESEARCH]: 1200,
      [TaskType.CONTACT_SCRAPING]: 600,
      [TaskType.DATA_EXTRACTION]: 1000,
      [TaskType.FORM_FILLING]: 300,
      [TaskType.CUSTOM_WORKFLOW]: 2000,
    };

    let tokens = baseTokens[context.type] || 500;

    // Adjust for complexity
    const complexityMultiplier = {
      low: 0.7,
      medium: 1.0,
      high: 1.8,
    };
    tokens *= complexityMultiplier[context.complexity];

    // Adjust for context size
    if (context.context_size) {
      tokens += context.context_size;
    }

    return Math.round(tokens);
  }

  /**
   * Store routing decision for learning and optimization
   */
  private storeRoutingDecision(context: TaskContext, decision: RouteDecision): void {
    const key = `${context.type}_${context.agent_type}_${context.complexity}`;
    
    if (!this.routingHistory.has(key)) {
      this.routingHistory.set(key, []);
    }
    
    this.routingHistory.get(key)!.push(decision);
    
    // Keep only last 100 decisions per key
    const history = this.routingHistory.get(key)!;
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Update performance metrics based on execution results
   */
  public updatePerformanceMetrics(
    model: AIModel,
    success: boolean,
    executionTime: number,
    actualCost: number
  ): void {
    const current = this.performanceMetrics.get(model) || {
      success_rate: 90,
      avg_time: 0,
      avg_cost: 0,
    };

    // Update success rate (exponential moving average)
    current.success_rate = current.success_rate * 0.9 + (success ? 100 : 0) * 0.1;
    
    // Update average time
    current.avg_time = current.avg_time * 0.9 + executionTime * 0.1;
    
    // Update average cost
    current.avg_cost = current.avg_cost * 0.9 + actualCost * 0.1;

    this.performanceMetrics.set(model, current);
    
    logger.info('Updated model performance metrics', {
      model,
      success,
      executionTime,
      actualCost,
      newMetrics: current,
    });
  }

  /**
   * Get routing analytics
   */
  public getRoutingAnalytics(): any {
    const analytics = {
      total_routes: 0,
      model_usage: {} as Record<AIModel, number>,
      avg_confidence: 0,
      performance_metrics: Object.fromEntries(this.performanceMetrics),
    };

    let totalConfidence = 0;
    
    for (const decisions of this.routingHistory.values()) {
      analytics.total_routes += decisions.length;
      
      for (const decision of decisions) {
        analytics.model_usage[decision.model] = (analytics.model_usage[decision.model] || 0) + 1;
        totalConfidence += decision.confidence;
      }
    }

    analytics.avg_confidence = analytics.total_routes > 0 ? totalConfidence / analytics.total_routes : 0;

    return analytics;
  }

  /**
   * Initialize performance metrics with baseline values
   */
  private initializeMetrics(): void {
    for (const model of Object.values(AIModel)) {
      const capabilities = MODEL_CAPABILITIES[model];
      this.performanceMetrics.set(model, {
        success_rate: capabilities.reliability,
        avg_time: 1000 / capabilities.speed, // Convert to ms per token
        avg_cost: capabilities.cost,
      });
    }
  }
}

export default ModelRouter;