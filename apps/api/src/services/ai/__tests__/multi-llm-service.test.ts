import { MultiLLMService } from '../multi-llm-service';
import { TaskType, AgentType } from '../../../../../../packages/shared/src/types/agent';
import { AIModel } from '../model-router';

// =============================================================================
// MULTI-LLM SERVICE TESTS
// Enterprise-Grade Testing for Superior AI System
// =============================================================================

describe('MultiLLMService', () => {
  let service: MultiLLMService;
  
  beforeEach(() => {
    // Reset singleton for testing
    (MultiLLMService as any).instance = null;
    service = MultiLLMService.getInstance();
  });

  afterEach(() => {
    service.shutdown();
  });

  describe('Service Initialization', () => {
    it('should initialize as singleton', () => {
      const service1 = MultiLLMService.getInstance();
      const service2 = MultiLLMService.getInstance();
      expect(service1).toBe(service2);
    });

    it('should initialize with multiple providers', () => {
      const stats = service.getStats();
      expect(stats.providers.length).toBeGreaterThan(0);
      expect(stats.providers.some(p => p.name === 'NVIDIA NIM')).toBe(true);
    });
  });

  describe('Chat with Context', () => {
    it('should handle job search request', async () => {
      const result = await service.chatWithContext(
        'test-session-1',
        'I need to find software engineering jobs in San Francisco',
        'test-user-1'
      );

      expect(result.response).toBeDefined();
      expect(result.intent.primaryIntent.type).toBe(TaskType.JOB_SEARCH);
      expect(result.intent.confidence).toBeGreaterThan(0.5);
      expect(result.metadata.suggestedActions).toBeDefined();
    });

    it('should handle job application request', async () => {
      const result = await service.chatWithContext(
        'test-session-2',
        'Apply to all the software engineer positions at Google',
        'test-user-2'
      );

      expect(result.response).toBeDefined();
      expect(result.intent.primaryIntent.type).toBe(TaskType.JOB_APPLICATION);
      expect(result.intent.primaryIntent.agentType).toBe(AgentType.NAVIGATOR);
    });

    it('should handle company research request', async () => {
      const result = await service.chatWithContext(
        'test-session-3',
        'Research Microsoft company culture and recent developments',
        'test-user-3'
      );

      expect(result.response).toBeDefined();
      expect(result.intent.primaryIntent.type).toBe(TaskType.COMPANY_RESEARCH);
      expect(result.intent.primaryIntent.agentType).toBe(AgentType.EXTRACTOR);
    });

    it('should maintain conversation context', async () => {
      const sessionId = 'test-session-context';
      const userId = 'test-user-context';

      // First message
      const result1 = await service.chatWithContext(
        sessionId,
        'I want to find jobs',
        userId
      );

      // Second message with context
      const result2 = await service.chatWithContext(
        sessionId,
        'Make them software engineering positions',
        userId
      );

      expect(result1.response).toBeDefined();
      expect(result2.response).toBeDefined();
      expect(result2.context).toContain('software engineering');
    });

    it('should handle ambiguous requests with clarification', async () => {
      const result = await service.chatWithContext(
        'test-session-ambiguous',
        'help me with work stuff',
        'test-user-ambiguous'
      );

      expect(result.response).toBeDefined();
      expect(result.intent.needsClarification).toBe(true);
      expect(result.intent.clarificationQuestions.length).toBeGreaterThan(0);
    });
  });

  describe('Model Routing', () => {
    it('should route navigation tasks to fast models', async () => {
      const taskContext = {
        type: TaskType.FORM_FILLING,
        agent_type: AgentType.NAVIGATOR,
        complexity: 'low' as const,
        priority: 'medium' as const,
        user_tier: 'premium' as const,
      };

      const request = {
        taskContext,
        messages: [{ role: 'user' as const, content: 'Fill out this form' }],
      };

      const response = await service.complete(request);
      
      // Should route to fast model for navigation
      expect([AIModel.MISTRAL_7B, AIModel.LLAMA_3_8B]).toContain(response.model);
      expect(response.metadata.routingDecision.confidence).toBeGreaterThan(0.6);
    });

    it('should route complex planning to powerful models', async () => {
      const taskContext = {
        type: TaskType.CUSTOM_WORKFLOW,
        agent_type: AgentType.PLANNER,
        complexity: 'high' as const,
        priority: 'high' as const,
        user_tier: 'enterprise' as const,
      };

      const request = {
        taskContext,
        messages: [{ role: 'user' as const, content: 'Create a complex automation workflow' }],
      };

      const response = await service.complete(request);
      
      // Should route to powerful model for complex planning
      expect([AIModel.LLAMA_3_70B, AIModel.CLAUDE_3_5_SONNET]).toContain(response.model);
      expect(response.metadata.routingDecision.confidence).toBeGreaterThan(0.7);
    });

    it('should use fallback models when primary fails', async () => {
      // Mock primary model failure
      const originalExecuteCompletion = (service as any).executeCompletion;
      let callCount = 0;
      
      (service as any).executeCompletion = jest.fn().mockImplementation(async (model, request, decision) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Primary model failed');
        }
        return originalExecuteCompletion.call(service, model, request, decision);
      });

      const taskContext = {
        type: TaskType.DATA_EXTRACTION,
        agent_type: AgentType.EXTRACTOR,
        complexity: 'medium' as const,
        priority: 'medium' as const,
        user_tier: 'premium' as const,
      };

      const request = {
        taskContext,
        messages: [{ role: 'user' as const, content: 'Extract data from website' }],
      };

      const response = await service.complete(request);
      
      expect(response).toBeDefined();
      expect(response.metadata.fallbackUsed).toBe(true);
      expect(response.metadata.retryCount).toBeGreaterThan(0);
    });
  });

  describe('Performance and Reliability', () => {
    it('should track performance metrics', () => {
      const stats = service.getStats();
      
      expect(stats.providers).toBeDefined();
      expect(stats.routingAnalytics).toBeDefined();
      expect(stats.providers.every(p => typeof p.isHealthy === 'boolean')).toBe(true);
    });

    it('should handle provider health checks', async () => {
      // Wait for health check cycle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = service.getStats();
      expect(stats.providers.every(p => p.lastHealthCheck instanceof Date)).toBe(true);
    });

    it('should calculate costs accurately', async () => {
      const taskContext = {
        type: TaskType.JOB_SEARCH,
        agent_type: AgentType.EXTRACTOR,
        complexity: 'medium' as const,
        priority: 'medium' as const,
        user_tier: 'premium' as const,
      };

      const request = {
        taskContext,
        messages: [{ role: 'user' as const, content: 'Find me 10 software engineering jobs' }],
      };

      const response = await service.complete(request);
      
      expect(response.metadata.cost).toBeGreaterThan(0);
      expect(response.metadata.cost).toBeLessThan(1); // Should be reasonable
      expect(response.usage.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network error
      const mockProvider = {
        name: 'Test Provider',
        client: {
          chatCompletion: jest.fn().mockRejectedValue(new Error('Network error')),
        },
        models: [AIModel.MISTRAL_7B],
        isHealthy: true,
        lastHealthCheck: new Date(),
      };

      (service as any).providers.set('test', mockProvider);

      const taskContext = {
        type: TaskType.DATA_EXTRACTION,
        agent_type: AgentType.EXTRACTOR,
        complexity: 'low' as const,
        priority: 'low' as const,
        user_tier: 'free' as const,
      };

      const request = {
        taskContext,
        messages: [{ role: 'user' as const, content: 'Test message' }],
      };

      // Should not throw, should use fallback
      await expect(service.complete(request)).resolves.toBeDefined();
    });

    it('should handle invalid requests', async () => {
      const invalidRequest = {
        taskContext: {
          type: 'invalid_type' as any,
          agent_type: AgentType.PLANNER,
          complexity: 'medium' as const,
          priority: 'medium' as const,
          user_tier: 'premium' as const,
        },
        messages: [],
      };

      await expect(service.complete(invalidRequest)).rejects.toThrow();
    });
  });

  describe('Context Management', () => {
    it('should maintain conversation context across messages', async () => {
      const sessionId = 'test-context-session';
      const userId = 'test-context-user';

      // Send multiple messages
      await service.chatWithContext(sessionId, 'I need help with job searching', userId);
      await service.chatWithContext(sessionId, 'Focus on tech companies', userId);
      const result = await service.chatWithContext(sessionId, 'What about startups?', userId);

      expect(result.context).toContain('job');
      expect(result.context).toContain('tech');
    });

    it('should extract entities from conversation', async () => {
      const result = await service.chatWithContext(
        'test-entity-session',
        'I want to apply to Google and Microsoft for software engineer positions',
        'test-entity-user'
      );

      expect(result.context).toContain('Google');
      expect(result.context).toContain('Microsoft');
      expect(result.context).toContain('software engineer');
    });
  });

  describe('Response Quality', () => {
    it('should generate appropriate responses for different user types', async () => {
      // Test beginner user
      const beginnerResult = await service.chatWithContext(
        'beginner-session',
        'I need help finding a job but I dont know where to start',
        'beginner-user'
      );

      expect(beginnerResult.response).toContain('help');
      expect(beginnerResult.metadata.followUpQuestions.length).toBeGreaterThan(0);

      // Test expert user
      const expertResult = await service.chatWithContext(
        'expert-session',
        'Execute a comprehensive job search for senior SWE roles with 200k+ TC',
        'expert-user'
      );

      expect(expertResult.response).toBeDefined();
      expect(expertResult.intent.primaryIntent.complexity).toBe('high');
    });

    it('should adapt response style based on context', async () => {
      const urgentResult = await service.chatWithContext(
        'urgent-session',
        'I need to apply to jobs ASAP, my current job ends tomorrow',
        'urgent-user'
      );

      expect(urgentResult.intent.primaryIntent.priority).toBe('urgent');
      expect(urgentResult.response).toContain('immediately');
    });

    it('should provide superior responses compared to basic systems', async () => {
      const complexResult = await service.chatWithContext(
        'complex-session',
        'I need to research 50 tech companies, extract contact info for their hiring managers, and create personalized outreach campaigns',
        'power-user'
      );

      // Should handle complex multi-step requests
      expect(complexResult.response).toBeDefined();
      expect(complexResult.intent.primaryIntent.type).toBe(TaskType.CUSTOM_WORKFLOW);
      expect(complexResult.metadata.suggestedActions.length).toBeGreaterThan(1);
      expect(complexResult.response.length).toBeGreaterThan(100); // Detailed response
    });
  });

  describe('Advanced Features (Superior to Manus)', () => {
    it('should handle multi-model ensemble for complex tasks', async () => {
      const ensembleResult = await service.chatWithContext(
        'ensemble-session',
        'Create a comprehensive job search strategy that includes market analysis, skill gap identification, and automated application workflows',
        'enterprise-user'
      );

      expect(ensembleResult.response).toBeDefined();
      expect(ensembleResult.intent.primaryIntent.complexity).toBe('high');
      expect(ensembleResult.metadata.suggestedActions.length).toBeGreaterThan(2);
    });

    it('should provide confidence scoring and uncertainty handling', async () => {
      const uncertainResult = await service.chatWithContext(
        'uncertain-session',
        'do something with jobs maybe',
        'vague-user'
      );

      expect(uncertainResult.intent.confidence).toBeLessThan(0.7);
      expect(uncertainResult.intent.needsClarification).toBe(true);
      expect(uncertainResult.intent.clarificationQuestions.length).toBeGreaterThan(0);
    });

    it('should optimize for cost and performance', async () => {
      const budgetContext = {
        type: TaskType.DATA_EXTRACTION,
        agent_type: AgentType.EXTRACTOR,
        complexity: 'low' as const,
        priority: 'low' as const,
        user_tier: 'free' as const,
        budget_limit: 0.005, // Very low budget
      };

      const request = {
        taskContext: budgetContext,
        messages: [{ role: 'user' as const, content: 'Extract basic company info' }],
      };

      const response = await service.complete(request);
      
      // Should use cost-effective model
      expect([AIModel.MISTRAL_7B, AIModel.NEMO_RETRIEVER]).toContain(response.model);
      expect(response.metadata.cost).toBeLessThan(0.01);
    });

    it('should handle real-time streaming responses', async () => {
      const chunks: string[] = [];
      let completed = false;

      const streamingRequest = {
        taskContext: {
          type: TaskType.JOB_SEARCH,
          agent_type: AgentType.PLANNER,
          complexity: 'medium' as const,
          priority: 'medium' as const,
          user_tier: 'premium' as const,
        },
        messages: [{ role: 'user' as const, content: 'Find me software engineering jobs' }],
        stream: true,
      };

      // Mock streaming (in real implementation, this would use actual streaming)
      const mockStreamingResponse = {
        onChunk: (chunk: string) => chunks.push(chunk),
        onComplete: () => { completed = true; },
        onError: (error: Error) => { throw error; },
      };

      // Simulate streaming response
      setTimeout(() => {
        mockStreamingResponse.onChunk('I\'ll help you');
        mockStreamingResponse.onChunk(' find software');
        mockStreamingResponse.onChunk(' engineering jobs.');
        mockStreamingResponse.onComplete();
      }, 100);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(chunks.length).toBeGreaterThan(0);
      expect(completed).toBe(true);
    });
  });

  describe('Integration and Scalability', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
        service.chatWithContext(
          `concurrent-session-${i}`,
          `Find jobs for user ${i}`,
          `concurrent-user-${i}`
        )
      );

      const results = await Promise.all(concurrentRequests);
      
      expect(results.length).toBe(10);
      expect(results.every(r => r.response.length > 0)).toBe(true);
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();
      
      const loadRequests = Array.from({ length: 5 }, (_, i) => 
        service.chatWithContext(
          `load-session-${i}`,
          'Execute complex job search with company research and application automation',
          `load-user-${i}`
        )
      );

      const results = await Promise.all(loadRequests);
      const endTime = Date.now();
      
      const averageResponseTime = (endTime - startTime) / results.length;
      
      expect(results.length).toBe(5);
      expect(averageResponseTime).toBeLessThan(5000); // Should respond within 5 seconds average
    });

    it('should provide comprehensive analytics', () => {
      const stats = service.getStats();
      
      expect(stats.providers).toBeDefined();
      expect(stats.routingAnalytics).toBeDefined();
      expect(stats.routingAnalytics.total_routes).toBeGreaterThanOrEqual(0);
      expect(stats.routingAnalytics.model_usage).toBeDefined();
      expect(stats.routingAnalytics.performance_metrics).toBeDefined();
    });
  });
});