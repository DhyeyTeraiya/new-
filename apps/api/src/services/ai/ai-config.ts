// =============================================================================
// ADVANCED AI CONFIGURATION
// Superior Multi-LLM System Configuration (Beats Manus Claude+Qwen Setup)
// =============================================================================

import { AIModel } from './model-router';
import { TaskType, AgentType } from '../../../../../packages/shared/src/types/agent';

export interface AISystemConfig {
  nvidia: NvidiaConfig;
  anthropic?: AnthropicConfig;
  openai?: OpenAIConfig;
  google?: GoogleConfig;
  routing: RoutingConfig;
  performance: PerformanceConfig;
  fallback: FallbackConfig;
  monitoring: MonitoringConfig;
}

export interface NvidiaConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    concurrentRequests: number;
  };
  models: {
    [key in AIModel]?: ModelConfig;
  };
}

export interface ModelConfig {
  enabled: boolean;
  priority: number;
  costPerToken: number;
  maxTokens: number;
  contextLength: number;
  capabilities: ModelCapabilities;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
}

export interface ModelCapabilities {
  planning: number;
  navigation: number;
  extraction: number;
  reasoning: number;
  coding: number;
  summarization: number;
  speed: number;
  reliability: number;
}

export interface AnthropicConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  models: string[];
}

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  models: string[];
}

export interface GoogleConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  models: string[];
}

export interface RoutingConfig {
  strategy: 'performance' | 'cost' | 'balanced' | 'quality';
  confidenceThreshold: number;
  fallbackThreshold: number;
  taskSpecificRouting: {
    [key in TaskType]: {
      preferredModels: AIModel[];
      fallbackModels: AIModel[];
      maxCost?: number;
      maxTime?: number;
    };
  };
  agentSpecificRouting: {
    [key in AgentType]: {
      preferredModels: AIModel[];
      capabilities: string[];
    };
  };
}

export interface PerformanceConfig {
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  batching: {
    enabled: boolean;
    maxBatchSize: number;
    batchTimeout: number;
  };
  streaming: {
    enabled: boolean;
    chunkSize: number;
  };
  monitoring: {
    metricsInterval: number;
    healthCheckInterval: number;
  };
}

export interface FallbackConfig {
  enabled: boolean;
  maxFallbacks: number;
  fallbackDelay: number;
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeout: number;
  };
}

export interface MonitoringConfig {
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    includeRequestData: boolean;
    includeResponseData: boolean;
  };
  metrics: {
    enabled: boolean;
    endpoint?: string;
    interval: number;
  };
  alerts: {
    enabled: boolean;
    thresholds: {
      errorRate: number;
      responseTime: number;
      costPerRequest: number;
    };
  };
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_AI_CONFIG: AISystemConfig = {
  nvidia: {
    apiKey: process.env['NVIDIA_API_KEY'] || '',
    baseUrl: process.env['NVIDIA_API_BASE_URL'] || 'https://integrate.api.nvidia.com',
    timeout: 90000,
    maxRetries: 5,
    retryDelay: 2000,
    rateLimits: {
      requestsPerMinute: 100,
      tokensPerMinute: 50000,
      concurrentRequests: 10,
    },
    models: {
      [AIModel.LLAMA_3_70B]: {
        enabled: true,
        priority: 1,
        costPerToken: 0.008,
        maxTokens: 4096,
        contextLength: 8192,
        capabilities: {
          planning: 95,
          navigation: 70,
          extraction: 80,
          reasoning: 95,
          coding: 85,
          summarization: 90,
          speed: 20,
          reliability: 95,
        },
      },
      [AIModel.MISTRAL_7B]: {
        enabled: true,
        priority: 2,
        costPerToken: 0.0015,
        maxTokens: 4096,
        contextLength: 32768,
        capabilities: {
          planning: 70,
          navigation: 90,
          extraction: 85,
          reasoning: 75,
          coding: 80,
          summarization: 70,
          speed: 80,
          reliability: 90,
        },
      },
      [AIModel.NEMO_RETRIEVER]: {
        enabled: true,
        priority: 3,
        costPerToken: 0.001,
        maxTokens: 2048,
        contextLength: 4096,
        capabilities: {
          planning: 60,
          navigation: 40,
          extraction: 95,
          reasoning: 70,
          coding: 30,
          summarization: 60,
          speed: 100,
          reliability: 95,
        },
      },
      [AIModel.MIXTRAL_8X7B]: {
        enabled: true,
        priority: 4,
        costPerToken: 0.006,
        maxTokens: 4096,
        contextLength: 32768,
        capabilities: {
          planning: 85,
          navigation: 75,
          extraction: 80,
          reasoning: 90,
          coding: 85,
          summarization: 95,
          speed: 40,
          reliability: 92,
        },
      },
      [AIModel.LLAMA_3_8B]: {
        enabled: true,
        priority: 5,
        costPerToken: 0.002,
        maxTokens: 4096,
        contextLength: 8192,
        capabilities: {
          planning: 75,
          navigation: 80,
          extraction: 85,
          reasoning: 80,
          coding: 75,
          summarization: 90,
          speed: 60,
          reliability: 88,
        },
      },
      [AIModel.DEEPSEEK_CODER]: {
        enabled: true,
        priority: 6,
        costPerToken: 0.004,
        maxTokens: 4096,
        contextLength: 16384,
        capabilities: {
          planning: 70,
          navigation: 85,
          extraction: 75,
          reasoning: 80,
          coding: 98,
          summarization: 60,
          speed: 50,
          reliability: 90,
        },
      },
      [AIModel.CODE_LLAMA]: {
        enabled: true,
        priority: 7,
        costPerToken: 0.005,
        maxTokens: 4096,
        contextLength: 16384,
        capabilities: {
          planning: 65,
          navigation: 80,
          extraction: 70,
          reasoning: 75,
          coding: 95,
          summarization: 55,
          speed: 45,
          reliability: 88,
        },
      },
    },
  },
  anthropic: {
    apiKey: process.env['ANTHROPIC_API_KEY'] || '',
    baseUrl: 'https://api.anthropic.com',
    timeout: 60000,
    maxRetries: 3,
    models: ['claude-3-5-sonnet-20241022'],
  },
  openai: {
    apiKey: process.env['OPENAI_API_KEY'] || '',
    baseUrl: 'https://api.openai.com/v1',
    timeout: 60000,
    maxRetries: 3,
    models: ['gpt-4o'],
  },
  google: {
    apiKey: process.env['GOOGLE_AI_API_KEY'] || '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeout: 60000,
    maxRetries: 3,
    models: ['gemini-pro'],
  },
  routing: {
    strategy: 'balanced',
    confidenceThreshold: 0.7,
    fallbackThreshold: 0.5,
    taskSpecificRouting: {
      [TaskType.JOB_SEARCH]: {
        preferredModels: [AIModel.NEMO_RETRIEVER, AIModel.MISTRAL_7B],
        fallbackModels: [AIModel.LLAMA_3_8B, AIModel.CLAUDE_3_5_SONNET],
        maxCost: 0.05,
        maxTime: 30000,
      },
      [TaskType.JOB_APPLICATION]: {
        preferredModels: [AIModel.MISTRAL_7B, AIModel.LLAMA_3_8B],
        fallbackModels: [AIModel.LLAMA_3_70B, AIModel.GPT_4O],
        maxCost: 0.10,
        maxTime: 60000,
      },
      [TaskType.COMPANY_RESEARCH]: {
        preferredModels: [AIModel.LLAMA_3_70B, AIModel.MIXTRAL_8X7B],
        fallbackModels: [AIModel.CLAUDE_3_5_SONNET, AIModel.GPT_4O],
        maxCost: 0.15,
        maxTime: 90000,
      },
      [TaskType.CONTACT_SCRAPING]: {
        preferredModels: [AIModel.NEMO_RETRIEVER, AIModel.MISTRAL_7B],
        fallbackModels: [AIModel.LLAMA_3_8B, AIModel.MIXTRAL_8X7B],
        maxCost: 0.08,
        maxTime: 45000,
      },
      [TaskType.DATA_EXTRACTION]: {
        preferredModels: [AIModel.NEMO_RETRIEVER, AIModel.LLAMA_3_8B],
        fallbackModels: [AIModel.MISTRAL_7B, AIModel.MIXTRAL_8X7B],
        maxCost: 0.06,
        maxTime: 40000,
      },
      [TaskType.FORM_FILLING]: {
        preferredModels: [AIModel.MISTRAL_7B, AIModel.LLAMA_3_8B],
        fallbackModels: [AIModel.NEMO_RETRIEVER, AIModel.DEEPSEEK_CODER],
        maxCost: 0.03,
        maxTime: 20000,
      },
      [TaskType.CUSTOM_WORKFLOW]: {
        preferredModels: [AIModel.LLAMA_3_70B, AIModel.CLAUDE_3_5_SONNET],
        fallbackModels: [AIModel.MIXTRAL_8X7B, AIModel.GPT_4O],
        maxCost: 0.25,
        maxTime: 120000,
      },
    },
    agentSpecificRouting: {
      [AgentType.PLANNER]: {
        preferredModels: [AIModel.LLAMA_3_70B, AIModel.CLAUDE_3_5_SONNET],
        capabilities: ['complex_reasoning', 'task_decomposition', 'strategic_planning'],
      },
      [AgentType.NAVIGATOR]: {
        preferredModels: [AIModel.MISTRAL_7B, AIModel.DEEPSEEK_CODER],
        capabilities: ['web_navigation', 'form_filling', 'ui_interaction'],
      },
      [AgentType.EXTRACTOR]: {
        preferredModels: [AIModel.NEMO_RETRIEVER, AIModel.LLAMA_3_8B],
        capabilities: ['data_extraction', 'content_parsing', 'information_retrieval'],
      },
      [AgentType.VERIFIER]: {
        preferredModels: [AIModel.MIXTRAL_8X7B, AIModel.LLAMA_3_70B],
        capabilities: ['quality_assessment', 'error_detection', 'validation'],
      },
    },
  },
  performance: {
    caching: {
      enabled: true,
      ttl: 3600000, // 1 hour
      maxSize: 1000,
    },
    batching: {
      enabled: true,
      maxBatchSize: 10,
      batchTimeout: 5000,
    },
    streaming: {
      enabled: true,
      chunkSize: 1024,
    },
    monitoring: {
      metricsInterval: 60000, // 1 minute
      healthCheckInterval: 300000, // 5 minutes
    },
  },
  fallback: {
    enabled: true,
    maxFallbacks: 3,
    fallbackDelay: 1000,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 60000,
    },
  },
  monitoring: {
    logging: {
      level: 'info',
      includeRequestData: false,
      includeResponseData: false,
    },
    metrics: {
      enabled: true,
      interval: 60000,
    },
    alerts: {
      enabled: true,
      thresholds: {
        errorRate: 0.05, // 5%
        responseTime: 10000, // 10 seconds
        costPerRequest: 0.50, // $0.50
      },
    },
  },
};

// =============================================================================
// CONFIGURATION UTILITIES
// =============================================================================

export function loadAIConfig(): AISystemConfig {
  // In production, this would load from environment variables, config files, etc.
  const config = { ...DEFAULT_AI_CONFIG };
  
  // Override with environment-specific settings
  if (process.env['NODE_ENV'] === 'production') {
    config.monitoring.logging.level = 'warn';
    config.performance.caching.ttl = 7200000; // 2 hours in production
    config.nvidia.rateLimits.requestsPerMinute = 200; // Higher limits in production
  }
  
  if (process.env['NODE_ENV'] === 'development') {
    config.monitoring.logging.level = 'debug';
    config.monitoring.logging.includeRequestData = true;
    config.performance.caching.enabled = false; // Disable caching in dev
  }
  
  return config;
}

export function validateAIConfig(config: AISystemConfig): string[] {
  const errors: string[] = [];
  
  // Validate NVIDIA configuration
  if (!config.nvidia.apiKey) {
    errors.push('NVIDIA API key is required');
  }
  
  if (config.nvidia.timeout < 10000) {
    errors.push('NVIDIA timeout should be at least 10 seconds');
  }
  
  // Validate model configurations
  const enabledModels = Object.entries(config.nvidia.models)
    .filter(([_, modelConfig]) => modelConfig?.enabled)
    .map(([model, _]) => model);
  
  if (enabledModels.length === 0) {
    errors.push('At least one NVIDIA model must be enabled');
  }
  
  // Validate routing configuration
  for (const [taskType, routing] of Object.entries(config.routing.taskSpecificRouting)) {
    if (routing.preferredModels.length === 0) {
      errors.push(`Task type ${taskType} must have at least one preferred model`);
    }
    
    if (routing.fallbackModels.length === 0) {
      errors.push(`Task type ${taskType} must have at least one fallback model`);
    }
  }
  
  // Validate performance configuration
  if (config.performance.caching.enabled && config.performance.caching.maxSize <= 0) {
    errors.push('Cache max size must be greater than 0 when caching is enabled');
  }
  
  return errors;
}

export function getModelConfig(model: AIModel, config: AISystemConfig): ModelConfig | null {
  return config.nvidia.models[model] || null;
}

export function getTaskRouting(taskType: TaskType, config: AISystemConfig) {
  return config.routing.taskSpecificRouting[taskType];
}

export function getAgentRouting(agentType: AgentType, config: AISystemConfig) {
  return config.routing.agentSpecificRouting[agentType];
}

// =============================================================================
// DYNAMIC CONFIGURATION UPDATES
// =============================================================================

export class AIConfigManager {
  private static instance: AIConfigManager;
  private config: AISystemConfig;
  private listeners: Array<(config: AISystemConfig) => void> = [];

  private constructor() {
    this.config = loadAIConfig();
    this.validateConfig();
  }

  public static getInstance(): AIConfigManager {
    if (!AIConfigManager.instance) {
      AIConfigManager.instance = new AIConfigManager();
    }
    return AIConfigManager.instance;
  }

  public getConfig(): AISystemConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<AISystemConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
    this.notifyListeners();
  }

  public updateModelConfig(model: AIModel, updates: Partial<ModelConfig>): void {
    if (this.config.nvidia.models[model]) {
      this.config.nvidia.models[model] = {
        ...this.config.nvidia.models[model]!,
        ...updates,
      };
      this.notifyListeners();
    }
  }

  public enableModel(model: AIModel): void {
    this.updateModelConfig(model, { enabled: true });
  }

  public disableModel(model: AIModel): void {
    this.updateModelConfig(model, { enabled: false });
  }

  public addConfigListener(listener: (config: AISystemConfig) => void): void {
    this.listeners.push(listener);
  }

  public removeConfigListener(listener: (config: AISystemConfig) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private validateConfig(): void {
    const errors = validateAIConfig(this.config);
    if (errors.length > 0) {
      throw new Error(`Invalid AI configuration: ${errors.join(', ')}`);
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.config);
      } catch (error) {
        console.error('Error notifying config listener:', error);
      }
    }
  }
}

export default AIConfigManager;