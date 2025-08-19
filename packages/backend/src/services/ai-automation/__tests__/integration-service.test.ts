/**
 * Tests for AI Automation Integration Service
 */

import { IntegrationService } from '../integration-service';
import { AIService } from '../../nvidia/ai-service';
import { AutomationEngine } from '../../automation/automation-engine';
import { ContextManager } from '../../nvidia/context-manager';
import { IntentClassifier } from '../../nvidia/intent-classifier';
import { ResponseGenerator } from '../../nvidia/response-generator';
import { Logger } from '../../../utils/logger';
import { PageContext, AutomationResult } from '@browser-ai-agent/shared';

// Mock dependencies
const mockAIService = {
  generateResponse: jest.fn()
} as jest.Mocked<AIService>;

const mockAutomationEngine = {
  executeAction: jest.fn(),
  stopAutomation: jest.fn()
} as jest.Mocked<AutomationEngine>;

const mockContextManager = {
  getContext: jest.fn(),
  updateContext: jest.fn()
} as jest.Mocked<ContextManager>;

const mockIntentClassifier = {
  classifyIntent: jest.fn()
} as jest.Mocked<IntentClassifier>;

const mockResponseGenerator = {
  generateResponse: jest.fn()
} as jest.Mocked<ResponseGenerator>;

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
} as jest.Mocked<Logger>;

describe('IntegrationService', () => {
  let integrationService: IntegrationService;
  let mockPageContext: PageContext;

  beforeEach(() => {
    jest.clearAllMocks();

    integrationService = new IntegrationService(
      mockAIService,
      mockAutomationEngine,
      mockContextManager,
      mockIntentClassifier,
      mockResponseGenerator,
      mockLogger
    );

    mockPageContext = {
      url: 'https://example.com',
      title: 'Test Page',
      content: 'Test content',
      elements: [
        {
          id: 'test-button',
          tagName: 'button',
          type: 'button',
          selector: '#test-button',
          xpath: '//*[@id="test-button"]',
          text: 'Click me',
          attributes: { id: 'test-button' },
          bounds: { x: 10, y: 10, width: 100, height: 30 },
          visible: true,
          interactable: true
        }
      ],
      metadata: {
        title: 'Test Page',
        description: '',
        keywords: '',
        author: '',
        lang: 'en',
        charset: 'UTF-8',
        loadingState: 'complete',
        hasForms: false,
        hasInteractiveElements: true,
        metaTags: {}
      },
      screenshot: null,
      timestamp: new Date(),
      viewport: {
        width: 1920,
        height: 1080,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1
      }
    };
  });

  describe('Message Processing', () => {
    it('should process message and return AI response', async () => {
      // Mock intent classification
      mockIntentClassifier.classifyIntent.mockResolvedValue({
        type: 'click_element',
        confidence: 0.9,
        target: { selector: '#test-button', description: 'test button' }
      });

      // Mock AI response generation
      mockResponseGenerator.generateResponse.mockResolvedValue({
        content: 'I can help you click that button.',
        type: 'automation',
        confidence: 0.9
      });

      const result = await integrationService.processMessage(
        'test-session',
        'Click the test button',
        mockPageContext
      );

      expect(result.aiResponse).toBeDefined();
      expect(result.aiResponse.content).toContain('click');
      expect(result.automationPlan).toBeDefined();
      expect(mockIntentClassifier.classifyIntent).toHaveBeenCalledWith(
        'Click the test button',
        mockPageContext
      );
    });

    it('should handle errors gracefully', async () => {
      mockIntentClassifier.classifyIntent.mockRejectedValue(
        new Error('Classification failed')
      );

      const result = await integrationService.processMessage(
        'test-session',
        'Click the test button',
        mockPageContext
      );

      expect(result.aiResponse.type).toBe('error');
      expect(result.aiResponse.content).toContain('error');
      expect(result.automationPlan).toBeUndefined();
    });

    it('should include learning insights when enabled', async () => {
      mockIntentClassifier.classifyIntent.mockResolvedValue({
        type: 'click_element',
        confidence: 0.9
      });

      mockResponseGenerator.generateResponse.mockResolvedValue({
        content: 'Test response',
        type: 'automation',
        confidence: 0.9
      });

      const result = await integrationService.processMessage(
        'test-session',
        'Test message',
        mockPageContext
      );

      expect(result.aiResponse.metadata?.learningInsights).toBeDefined();
      expect(result.aiResponse.metadata.learningInsights).toHaveProperty('successRate');
      expect(result.aiResponse.metadata.learningInsights).toHaveProperty('totalExecutions');
    });
  });

  describe('Automation Execution', () => {
    it('should execute automation successfully', async () => {
      const mockResult: AutomationResult = {
        success: true,
        planId: 'test-plan',
        stepsExecuted: 1,
        totalSteps: 1,
        results: [{ success: true, action: 'click' }],
        executionTime: 1000,
        completedAt: new Date()
      };

      // Mock the coordinator's executeAutomation method
      jest.spyOn(integrationService['coordinator'], 'executeAutomation')
        .mockResolvedValue(mockResult);

      const result = await integrationService.executeAutomation(
        'test-session',
        'test-plan',
        true
      );

      expect(result.result.success).toBe(true);
      expect(result.result.stepsExecuted).toBe(1);
    });

    it('should retry failed automation with alternative plan', async () => {
      const failedResult: AutomationResult = {
        success: false,
        planId: 'test-plan',
        stepsExecuted: 0,
        totalSteps: 1,
        results: [],
        errors: ['Element not found'],
        executionTime: 500,
        completedAt: new Date()
      };

      const successResult: AutomationResult = {
        success: true,
        planId: 'alternative-plan',
        stepsExecuted: 1,
        totalSteps: 1,
        results: [{ success: true, action: 'click' }],
        executionTime: 1000,
        completedAt: new Date()
      };

      // Mock first attempt fails, second succeeds
      jest.spyOn(integrationService['coordinator'], 'executeAutomation')
        .mockResolvedValueOnce(failedResult)
        .mockResolvedValueOnce(successResult);

      // Mock alternative plan generation
      jest.spyOn(integrationService['feedbackAnalyzer'], 'generateAlternativeApproach')
        .mockReturnValue({
          id: 'alternative-plan',
          sessionId: 'test-session',
          steps: [],
          requiresConfirmation: false,
          riskLevel: 'low',
          estimatedDuration: 1000,
          createdAt: new Date(),
          metadata: { isAlternative: true }
        });

      const result = await integrationService.executeAutomation(
        'test-session',
        'test-plan',
        true
      );

      expect(result.result.success).toBe(true);
      expect(integrationService['coordinator'].executeAutomation).toHaveBeenCalledTimes(2);
    });

    it('should return failure after max retries', async () => {
      const failedResult: AutomationResult = {
        success: false,
        planId: 'test-plan',
        stepsExecuted: 0,
        totalSteps: 1,
        results: [],
        errors: ['Persistent error'],
        executionTime: 500,
        completedAt: new Date()
      };

      // Mock all attempts fail
      jest.spyOn(integrationService['coordinator'], 'executeAutomation')
        .mockResolvedValue(failedResult);

      // Mock no alternative plan available
      jest.spyOn(integrationService['feedbackAnalyzer'], 'generateAlternativeApproach')
        .mockReturnValue(null);

      const result = await integrationService.executeAutomation(
        'test-session',
        'test-plan',
        true
      );

      expect(result.result.success).toBe(false);
      expect(result.feedback).toBeDefined();
    });
  });

  describe('User Feedback', () => {
    it('should process positive user feedback', async () => {
      const feedback = {
        rating: 5,
        comments: 'Great automation!',
        wasHelpful: true
      };

      const response = await integrationService.provideUserFeedback(
        'test-session',
        'test-plan',
        feedback
      );

      expect(response.content).toContain('glad');
      expect(response.metadata?.userRating).toBe(5);
      expect(response.metadata?.wasHelpful).toBe(true);
    });

    it('should process negative user feedback', async () => {
      const feedback = {
        rating: 1,
        comments: 'Did not work',
        wasHelpful: false
      };

      const response = await integrationService.provideUserFeedback(
        'test-session',
        'test-plan',
        feedback
      );

      expect(response.content).toContain('sorry');
      expect(response.metadata?.userRating).toBe(1);
      expect(response.metadata?.wasHelpful).toBe(false);
    });
  });

  describe('Learning Insights', () => {
    it('should return learning insights when enabled', () => {
      const insights = integrationService.getLearningInsights();

      expect(insights.enabled).toBe(true);
      expect(insights).toHaveProperty('totalExecutions');
      expect(insights).toHaveProperty('successRate');
      expect(insights).toHaveProperty('configuration');
    });

    it('should return disabled status when learning is disabled', () => {
      integrationService.updateConfiguration({ enableLearning: false });
      
      const insights = integrationService.getLearningInsights();

      expect(insights.enabled).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxRetries: 5,
        riskThreshold: 'high' as const,
        requireConfirmationForRisk: false
      };

      integrationService.updateConfiguration(newConfig);

      const insights = integrationService.getLearningInsights();
      expect(insights.configuration.maxRetries).toBe(5);
      expect(insights.configuration.riskThreshold).toBe('high');
      expect(insights.configuration.requireConfirmationForRisk).toBe(false);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when all components are working', async () => {
      mockAIService.generateResponse.mockResolvedValue({
        content: 'test',
        type: 'test',
        confidence: 1
      });

      mockContextManager.getContext.mockResolvedValue({});

      const health = await integrationService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.components.aiService).toBe(true);
      expect(health.components.contextManager).toBe(true);
    });

    it('should return degraded status when some components fail', async () => {
      mockAIService.generateResponse.mockRejectedValue(new Error('AI service down'));
      mockContextManager.getContext.mockResolvedValue({});

      const health = await integrationService.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.components.aiService).toBe(false);
      expect(health.components.contextManager).toBe(true);
    });

    it('should return unhealthy status when all components fail', async () => {
      mockAIService.generateResponse.mockRejectedValue(new Error('AI service down'));
      mockContextManager.getContext.mockRejectedValue(new Error('Context manager down'));

      const health = await integrationService.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.components.aiService).toBe(false);
      expect(health.components.contextManager).toBe(false);
    });
  });

  describe('Automation Status', () => {
    it('should return automation status', () => {
      const mockStatus = {
        isActive: true,
        currentStep: 2,
        totalSteps: 5,
        progress: 40,
        estimatedTimeRemaining: 15000
      };

      jest.spyOn(integrationService['coordinator'], 'getAutomationStatus')
        .mockReturnValue(mockStatus);

      const status = integrationService.getAutomationStatus('test-session');

      expect(status).toEqual(mockStatus);
    });

    it('should cancel automation', async () => {
      const cancelSpy = jest.spyOn(integrationService['coordinator'], 'cancelAutomation')
        .mockResolvedValue();

      await integrationService.cancelAutomation('test-session');

      expect(cancelSpy).toHaveBeenCalledWith('test-session');
    });
  });
});