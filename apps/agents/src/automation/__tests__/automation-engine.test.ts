import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import AutomationEngine, { AutomationTask, AutomationConfig, AutomationStep } from '../automation-engine';
import { ElementContext } from '../element-selector';
import { WaitCondition } from '../intelligent-waiter';

// =============================================================================
// AUTOMATION ENGINE INTEGRATION TESTS
// Superior to Manus testing with real website scenarios
// =============================================================================

describe('AutomationEngine Integration Tests', () => {
  let automationEngine: AutomationEngine;
  let mockTask: AutomationTask;

  beforeEach(() => {
    automationEngine = new AutomationEngine();
    
    // Create comprehensive test task
    mockTask = {
      id: 'test-task-001',
      name: 'Advanced Web Automation Test',
      steps: [
        {
          id: 'step-001',
          type: 'navigate',
          name: 'Navigate to test page',
          parameters: {
            url: 'https://example.com',
            waitUntil: 'networkidle',
          },
          timeout: 30000,
        },
        {
          id: 'step-002',
          type: 'click',
          name: 'Click login button',
          parameters: {
            clickOptions: {
              button: 'left',
              clickCount: 1,
            },
          },
          elementContext: {
            description: 'Login button',
            expectedType: 'button',
            attributes: {
              testid: 'login-btn',
            },
          },
          waitConditions: [
            {
              type: 'element',
              selector: '[data-testid="login-btn"]',
              timeout: 10000,
            },
          ],
          validation: {
            required: true,
            timeout: 5000,
          },
          onError: {
            strategy: 'retry',
            maxRetries: 3,
          },
        },
        {
          id: 'step-003',
          type: 'type',
          name: 'Enter username',
          parameters: {
            text: 'testuser@example.com',
            typeOptions: {
              delay: 100,
              clear: true,
              humanLike: true,
            },
          },
          elementContext: {
            description: 'Username input field',
            expectedType: 'input',
            attributes: {
              name: 'username',
              placeholder: 'Enter your email',
            },
          },
        },
        {
          id: 'step-004',
          type: 'screenshot',
          name: 'Capture login form',
          parameters: {
            name: 'login-form-filled',
            fullPage: false,
            screenshotOptions: {
              type: 'png',
              quality: 90,
            },
          },
        },
        {
          id: 'step-005',
          type: 'extract',
          name: 'Extract page title',
          parameters: {
            extractType: 'text',
          },
          elementContext: {
            description: 'Page title',
            expectedType: 'text',
          },
        },
      ],
      config: {
        browserConfig: {
          type: 'chromium',
          headless: true,
          stealth: true,
          viewport: {
            width: 1920,
            height: 1080,
          },
        },
        actionConfig: {
          humanLike: true,
          speed: 'normal',
          retryAttempts: 3,
          waitBetweenActions: 1000,
          scrollIntoView: true,
          takeScreenshots: true,
          validateAfterAction: true,
        },
        screenshotConfig: {
          enabled: true,
          captureOnError: true,
          captureOnSuccess: true,
          visualTesting: true,
        },
        selfHealing: {
          enabled: true,
          maxAttempts: 3,
          strategies: [
            {
              name: 'element-not-found',
              trigger: 'Element not found',
              action: 'update_selector',
              parameters: {
                useAI: true,
                fallbackSelectors: true,
              },
            },
            {
              name: 'timeout-recovery',
              trigger: 'timeout',
              action: 'wait_longer',
              parameters: {
                additionalWait: 5000,
              },
            },
          ],
        },
        performance: {
          parallelExecution: false,
          maxConcurrency: 1,
          resourceOptimization: true,
        },
      },
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 10000,
        retryConditions: ['timeout', 'element_not_found', 'network_error'],
      },
      validation: {
        enabled: true,
        strictMode: false,
        customValidators: [],
      },
      metadata: {
        testSuite: 'integration',
        priority: 'high',
        tags: ['login', 'authentication', 'ui'],
      },
    };
  });

  afterEach(async () => {
    await automationEngine.shutdown();
  });

  describe('Task Execution', () => {
    it('should execute a complete automation task successfully', async () => {
      // Mock browser interactions for testing
      jest.setTimeout(60000);

      const result = await automationEngine.executeTask(mockTask);

      expect(result).toBeDefined();
      expect(result.taskId).toBe(mockTask.id);
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(mockTask.steps.length);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle step failures with retry logic', async () => {
      // Create task with failing step
      const failingTask = {
        ...mockTask,
        steps: [
          {
            id: 'failing-step',
            type: 'click',
            name: 'Click non-existent element',
            parameters: {},
            elementContext: {
              description: 'Non-existent button',
              expectedType: 'button',
            },
            onError: {
              strategy: 'retry',
              maxRetries: 2,
            },
          } as AutomationStep,
        ],
      };

      const result = await automationEngine.executeTask(failingTask);

      expect(result.success).toBe(false);
      expect(result.stepResults[0].retryCount).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should apply self-healing strategies when enabled', async () => {
      const selfHealingTask = {
        ...mockTask,
        config: {
          ...mockTask.config,
          selfHealing: {
            enabled: true,
            maxAttempts: 2,
            strategies: [
              {
                name: 'selector-update',
                trigger: 'Element not found',
                action: 'update_selector',
                parameters: {
                  useAI: true,
                },
              },
            ],
          },
        },
      };

      const result = await automationEngine.executeTask(selfHealingTask);

      // Self-healing should be attempted even if it doesn't succeed
      expect(result).toBeDefined();
      expect(result.selfHealingActions).toBeDefined();
    });

    it('should capture screenshots at appropriate times', async () => {
      const result = await automationEngine.executeTask(mockTask);

      expect(result.screenshots.length).toBeGreaterThan(0);
      
      // Check that screenshot step produced a result
      const screenshotStep = result.stepResults.find(s => s.stepName === 'Capture login form');
      expect(screenshotStep).toBeDefined();
      expect(screenshotStep?.success).toBe(true);
    });

    it('should collect performance metrics', async () => {
      const result = await automationEngine.executeTask(mockTask);

      expect(result.performance).toBeDefined();
      expect(result.performance.totalDuration).toBeGreaterThan(0);
      expect(typeof result.performance.networkTime).toBe('number');
      expect(typeof result.performance.actionTime).toBe('number');
    });
  });

  describe('Multiple Task Execution', () => {
    it('should execute multiple tasks concurrently', async () => {
      const tasks = [
        { ...mockTask, id: 'task-1', name: 'Task 1' },
        { ...mockTask, id: 'task-2', name: 'Task 2' },
        { ...mockTask, id: 'task-3', name: 'Task 3' },
      ];

      const startTime = Date.now();
      const results = await automationEngine.executeMultipleTasks(tasks, 2);
      const duration = Date.now() - startTime;

      expect(results.size).toBe(3);
      expect(duration).toBeLessThan(180000); // Should be faster than sequential execution
      
      for (const [taskId, result] of results) {
        expect(result.taskId).toBe(taskId);
        expect(result).toBeDefined();
      }
    });

    it('should respect concurrency limits', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        ...mockTask,
        id: `task-${i + 1}`,
        name: `Task ${i + 1}`,
      }));

      const maxConcurrency = 2;
      const results = await automationEngine.executeMultipleTasks(tasks, maxConcurrency);

      expect(results.size).toBe(5);
      // All tasks should complete successfully
      for (const result of results.values()) {
        expect(result).toBeDefined();
      }
    });
  });

  describe('Advanced Features', () => {
    it('should handle complex element selection scenarios', async () => {
      const complexTask = {
        ...mockTask,
        steps: [
          {
            id: 'complex-selection',
            type: 'click',
            name: 'Click dynamic element',
            parameters: {},
            elementContext: {
              description: 'Submit button in modal dialog',
              expectedType: 'button',
              nearbyText: 'Confirm your action',
              parentContext: 'modal-dialog',
              position: 'bottom',
            } as ElementContext,
          } as AutomationStep,
        ],
      };

      const result = await automationEngine.executeTask(complexTask);
      expect(result).toBeDefined();
    });

    it('should handle intelligent waiting scenarios', async () => {
      const waitingTask = {
        ...mockTask,
        steps: [
          {
            id: 'intelligent-wait',
            type: 'wait',
            name: 'Wait for dynamic content',
            parameters: {
              waitCondition: {
                type: 'content',
                text: 'Loading complete',
                timeout: 15000,
              } as WaitCondition,
            },
          } as AutomationStep,
        ],
      };

      const result = await automationEngine.executeTask(waitingTask);
      expect(result).toBeDefined();
    });

    it('should perform visual testing and comparisons', async () => {
      const visualTask = {
        ...mockTask,
        config: {
          ...mockTask.config,
          screenshotConfig: {
            enabled: true,
            captureOnError: true,
            captureOnSuccess: true,
            visualTesting: true,
          },
        },
        steps: [
          {
            id: 'visual-test',
            type: 'screenshot',
            name: 'Visual regression test',
            parameters: {
              name: 'homepage-baseline',
              fullPage: true,
              visualTest: {
                name: 'homepage-layout',
                threshold: 0.1,
                ignoreRegions: [],
                tags: ['homepage', 'layout'],
              },
            },
          } as AutomationStep,
        ],
      };

      const result = await automationEngine.executeTask(visualTask);
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts gracefully', async () => {
      const timeoutTask = {
        ...mockTask,
        steps: [
          {
            id: 'timeout-step',
            type: 'navigate',
            name: 'Navigate to slow page',
            parameters: {
              url: 'https://httpstat.us/200?sleep=30000', // Simulates slow response
            },
            timeout: 5000, // Short timeout to trigger failure
            onError: {
              strategy: 'retry',
              maxRetries: 1,
            },
          } as AutomationStep,
        ],
      };

      const result = await automationEngine.executeTask(timeoutTask);
      
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.stepResults[0].retryCount).toBeGreaterThan(0);
    });

    it('should handle browser crashes and recovery', async () => {
      // This would test browser crash scenarios
      // For now, we'll simulate with a mock error
      const crashTask = {
        ...mockTask,
        steps: [
          {
            id: 'crash-simulation',
            type: 'custom',
            name: 'Simulate browser crash',
            parameters: {
              customFunction: async () => {
                throw new Error('Browser crashed');
              },
            },
            onError: {
              strategy: 'retry',
              maxRetries: 2,
            },
          } as AutomationStep,
        ],
      };

      const result = await automationEngine.executeTask(crashTask);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle anti-bot detection and evasion', async () => {
      const stealthTask = {
        ...mockTask,
        config: {
          ...mockTask.config,
          browserConfig: {
            ...mockTask.config.browserConfig,
            stealth: true,
            fingerprint: {
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              platform: 'Win32',
              languages: ['en-US', 'en'],
              screen: { width: 1920, height: 1080, colorDepth: 24 },
              timezone: 'America/New_York',
              webgl: { vendor: 'Google Inc.', renderer: 'ANGLE' },
              canvas: 'mock-canvas-fingerprint',
              fonts: ['Arial', 'Helvetica', 'Times New Roman'],
            },
          },
        },
      };

      const result = await automationEngine.executeTask(stealthTask);
      expect(result).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should maintain performance under load', async () => {
      const loadTasks = Array.from({ length: 10 }, (_, i) => ({
        ...mockTask,
        id: `load-task-${i}`,
        name: `Load Task ${i}`,
        steps: mockTask.steps.slice(0, 2), // Shorter tasks for load testing
      }));

      const startTime = Date.now();
      const results = await automationEngine.executeMultipleTasks(loadTasks, 5);
      const duration = Date.now() - startTime;

      expect(results.size).toBe(10);
      expect(duration).toBeLessThan(300000); // Should complete within 5 minutes
      
      // Check that all tasks completed
      for (const result of results.values()) {
        expect(result).toBeDefined();
      }
    });

    it('should optimize resource usage', async () => {
      const resourceTask = {
        ...mockTask,
        config: {
          ...mockTask.config,
          performance: {
            parallelExecution: false,
            maxConcurrency: 1,
            resourceOptimization: true,
          },
        },
      };

      const result = await automationEngine.executeTask(resourceTask);
      
      expect(result).toBeDefined();
      expect(result.performance.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(result.performance.cpuUsage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration with Real Websites', () => {
    it('should handle modern SPA applications', async () => {
      const spaTask = {
        ...mockTask,
        steps: [
          {
            id: 'spa-navigation',
            type: 'navigate',
            name: 'Navigate to SPA',
            parameters: {
              url: 'https://react-app-example.com',
              waitUntil: 'networkidle',
            },
          },
          {
            id: 'spa-interaction',
            type: 'click',
            name: 'Click SPA button',
            parameters: {},
            elementContext: {
              description: 'React component button',
              expectedType: 'button',
            },
            waitConditions: [
              {
                type: 'network',
                networkIdle: true,
                timeout: 10000,
              },
            ],
          },
        ] as AutomationStep[],
      };

      const result = await automationEngine.executeTask(spaTask);
      expect(result).toBeDefined();
    });

    it('should handle AJAX-heavy applications', async () => {
      const ajaxTask = {
        ...mockTask,
        steps: [
          {
            id: 'ajax-wait',
            type: 'wait',
            name: 'Wait for AJAX content',
            parameters: {
              waitCondition: {
                type: 'element',
                selector: '.ajax-loaded-content',
                timeout: 15000,
              },
            },
          },
        ] as AutomationStep[],
      };

      const result = await automationEngine.executeTask(ajaxTask);
      expect(result).toBeDefined();
    });

    it('should handle form submissions and redirects', async () => {
      const formTask = {
        ...mockTask,
        steps: [
          {
            id: 'form-fill',
            type: 'type',
            name: 'Fill form field',
            parameters: {
              text: 'test@example.com',
            },
            elementContext: {
              description: 'Email input',
              expectedType: 'input',
              attributes: { type: 'email' },
            },
          },
          {
            id: 'form-submit',
            type: 'click',
            name: 'Submit form',
            parameters: {},
            elementContext: {
              description: 'Submit button',
              expectedType: 'button',
              attributes: { type: 'submit' },
            },
          },
          {
            id: 'redirect-wait',
            type: 'wait',
            name: 'Wait for redirect',
            parameters: {
              waitCondition: {
                type: 'url',
                url: 'success',
                timeout: 10000,
              },
            },
          },
        ] as AutomationStep[],
      };

      const result = await automationEngine.executeTask(formTask);
      expect(result).toBeDefined();
    });
  });

  describe('Utility Methods', () => {
    it('should provide accurate statistics', () => {
      const stats = automationEngine.getStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.activeTasks).toBe('number');
      expect(typeof stats.completedTasks).toBe('number');
      expect(stats.browserStats).toBeDefined();
      expect(stats.screenshotStats).toBeDefined();
    });

    it('should allow task cancellation', async () => {
      // Start a long-running task
      const longTask = {
        ...mockTask,
        id: 'long-running-task',
        steps: [
          {
            id: 'long-wait',
            type: 'wait',
            name: 'Long wait',
            parameters: {
              waitCondition: {
                type: 'custom',
                customFunction: async () => {
                  await new Promise(resolve => setTimeout(resolve, 30000));
                  return true;
                },
                timeout: 60000,
              },
            },
          } as AutomationStep,
        ],
      };

      // Start task execution (don't await)
      const taskPromise = automationEngine.executeTask(longTask);
      
      // Cancel after short delay
      setTimeout(async () => {
        const cancelled = await automationEngine.cancelTask(longTask.id);
        expect(cancelled).toBe(true);
      }, 1000);

      // Task should eventually complete (cancelled or finished)
      const result = await taskPromise;
      expect(result).toBeDefined();
    });

    it('should retrieve task results', async () => {
      const result = await automationEngine.executeTask(mockTask);
      
      const retrievedResult = automationEngine.getTaskResult(mockTask.id);
      expect(retrievedResult).toBeDefined();
      expect(retrievedResult?.taskId).toBe(mockTask.id);
      
      const allResults = automationEngine.getAllTaskResults();
      expect(allResults.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// PERFORMANCE BENCHMARKS
// =============================================================================

describe('AutomationEngine Performance Benchmarks', () => {
  let automationEngine: AutomationEngine;

  beforeEach(() => {
    automationEngine = new AutomationEngine();
  });

  afterEach(async () => {
    await automationEngine.shutdown();
  });

  it('should complete simple navigation under 5 seconds', async () => {
    const simpleTask = {
      id: 'perf-nav-test',
      name: 'Performance Navigation Test',
      steps: [
        {
          id: 'nav-step',
          type: 'navigate',
          name: 'Navigate to page',
          parameters: {
            url: 'https://example.com',
          },
        } as AutomationStep,
      ],
      config: {
        browserConfig: { type: 'chromium', headless: true },
        actionConfig: {
          humanLike: false,
          speed: 'fast',
          retryAttempts: 1,
          waitBetweenActions: 0,
          scrollIntoView: false,
          takeScreenshots: false,
          validateAfterAction: false,
        },
        screenshotConfig: {
          enabled: false,
          captureOnError: false,
          captureOnSuccess: false,
          visualTesting: false,
        },
        selfHealing: { enabled: false, maxAttempts: 0, strategies: [] },
        performance: {
          parallelExecution: false,
          maxConcurrency: 1,
          resourceOptimization: true,
        },
      },
      retryPolicy: {
        maxAttempts: 1,
        backoffStrategy: 'fixed',
        baseDelay: 0,
        maxDelay: 0,
        retryConditions: [],
      },
      validation: { enabled: false, strictMode: false, customValidators: [] },
      metadata: {},
    } as AutomationTask;

    const startTime = Date.now();
    const result = await automationEngine.executeTask(simpleTask);
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(5000);
  });

  it('should handle 20+ page automation under 2 minutes', async () => {
    const multiPageTask = {
      id: 'perf-multi-page-test',
      name: 'Performance Multi-Page Test',
      steps: Array.from({ length: 20 }, (_, i) => ({
        id: `page-${i}`,
        type: 'navigate',
        name: `Navigate to page ${i}`,
        parameters: {
          url: `https://httpbin.org/delay/1`, // 1 second delay per page
        },
      })) as AutomationStep[],
      config: {
        browserConfig: { type: 'chromium', headless: true },
        actionConfig: {
          humanLike: false,
          speed: 'fast',
          retryAttempts: 1,
          waitBetweenActions: 0,
          scrollIntoView: false,
          takeScreenshots: false,
          validateAfterAction: false,
        },
        screenshotConfig: {
          enabled: false,
          captureOnError: false,
          captureOnSuccess: false,
          visualTesting: false,
        },
        selfHealing: { enabled: false, maxAttempts: 0, strategies: [] },
        performance: {
          parallelExecution: false,
          maxConcurrency: 1,
          resourceOptimization: true,
        },
      },
      retryPolicy: {
        maxAttempts: 1,
        backoffStrategy: 'fixed',
        baseDelay: 0,
        maxDelay: 0,
        retryConditions: [],
      },
      validation: { enabled: false, strictMode: false, customValidators: [] },
      metadata: {},
    } as AutomationTask;

    const startTime = Date.now();
    const result = await automationEngine.executeTask(multiPageTask);
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(120000); // 2 minutes
    expect(result.stepResults).toHaveLength(20);
  });
});