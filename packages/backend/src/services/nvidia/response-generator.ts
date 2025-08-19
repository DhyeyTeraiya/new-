import { 
  AIResponse, 
  AIResponseType, 
  UserIntent, 
  BrowserAction, 
  ActionPlan,
  PageContext,
  ActionStep
} from '@browser-ai-agent/shared';
import { NVIDIAClient } from './nvidia-client';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class ResponseGenerator {
  private readonly logger: Logger;
  private readonly nvidiaClient: NVIDIAClient;

  constructor(nvidiaClient: NVIDIAClient) {
    this.logger = createLogger('ResponseGenerator');
    this.nvidiaClient = nvidiaClient;
  }

  /**
   * Generate AI response based on user intent
   */
  async generateResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext,
    conversationHistory?: string[]
  ): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      let response: AIResponse;

      switch (intent.category) {
        case 'interaction':
          response = await this.generateInteractionResponse(userMessage, intent, pageContext);
          break;
        case 'navigation':
          response = await this.generateNavigationResponse(userMessage, intent, pageContext);
          break;
        case 'extraction':
          response = await this.generateExtractionResponse(userMessage, intent, pageContext);
          break;
        case 'analysis':
          response = await this.generateAnalysisResponse(userMessage, intent, pageContext);
          break;
        case 'automation':
          response = await this.generateAutomationResponse(userMessage, intent, pageContext);
          break;
        case 'form_fill':
          response = await this.generateFormFillResponse(userMessage, intent, pageContext);
          break;
        case 'search':
          response = await this.generateSearchResponse(userMessage, intent, pageContext);
          break;
        default:
          response = await this.generateQuestionResponse(userMessage, intent, pageContext, conversationHistory);
      }

      const processingTime = Date.now() - startTime;
      response.metadata = {
        ...response.metadata,
        processingTime,
        model: this.getModelForIntent(intent),
        cached: false,
        contextUsed: pageContext ? ['page_context'] : [],
      };

      this.logger.debug('Response generated', {
        intentCategory: intent.category,
        responseType: response.type,
        hasActions: !!response.actions?.length,
        processingTime,
      });

      return response;
    } catch (error) {
      this.logger.error('Response generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        intentCategory: intent.category,
      });

      return this.generateErrorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Generate response for interaction intents
   */
  private async generateInteractionResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const actions = await this.generateInteractionActions(intent, pageContext);
    
    const prompt = this.buildActionPrompt(userMessage, actions, pageContext);
    const aiResponse = await this.nvidiaClient.sendPrimaryRequest([
      { role: 'system', content: prompt },
      { role: 'user', content: userMessage },
    ], { max_tokens: 300 });

    const message = aiResponse.choices[0]?.message?.content || 'I\'ll help you with that interaction.';

    return {
      id: uuidv4(),
      message,
      actions,
      type: 'action_plan',
      confidence: intent.confidence,
      suggestions: this.generateSuggestions(intent, pageContext),
      timestamp: new Date(),
    };
  }

  /**
   * Generate response for navigation intents
   */
  private async generateNavigationResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const actions = await this.generateNavigationActions(intent, pageContext);
    
    const message = this.getNavigationMessage(intent, actions);

    return {
      id: uuidv4(),
      message,
      actions,
      type: 'action_plan',
      confidence: intent.confidence,
      timestamp: new Date(),
    };
  }

  /**
   * Generate response for extraction intents
   */
  private async generateExtractionResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const actions = await this.generateExtractionActions(intent, pageContext);
    
    const prompt = `You are helping extract data from a webpage. The user wants to: ${userMessage}
    
Available page elements: ${pageContext?.elements.length || 0}
Page has forms: ${pageContext?.metadata.hasForms || false}

Explain what data will be extracted and how it will be processed.`;

    const aiResponse = await this.nvidiaClient.sendPrimaryRequest([
      { role: 'system', content: prompt },
      { role: 'user', content: userMessage },
    ], { max_tokens: 400 });

    const message = aiResponse.choices[0]?.message?.content || 'I\'ll extract the requested data for you.';

    return {
      id: uuidv4(),
      message,
      actions,
      type: 'action_plan',
      confidence: intent.confidence,
      timestamp: new Date(),
    };
  }

  /**
   * Generate response for analysis intents
   */
  private async generateAnalysisResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const prompt = this.buildAnalysisPrompt(pageContext);
    
    const aiResponse = await this.nvidiaClient.sendComplexRequest([
      { role: 'system', content: prompt },
      { role: 'user', content: userMessage },
    ], { max_tokens: 800 });

    const message = aiResponse.choices[0]?.message?.content || 'I\'ve analyzed the page content.';

    return {
      id: uuidv4(),
      message,
      type: 'analysis',
      confidence: intent.confidence,
      suggestions: this.generateAnalysisSuggestions(pageContext),
      timestamp: new Date(),
    };
  }

  /**
   * Generate response for automation intents
   */
  private async generateAutomationResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const actionPlan = await this.generateActionPlan(userMessage, intent, pageContext);
    
    const message = `I'll help you automate this task. Here's what I'll do:\n\n${actionPlan.description}\n\nThis will involve ${actionPlan.steps.length} steps. Would you like me to proceed?`;

    return {
      id: uuidv4(),
      message,
      actions: actionPlan.steps.map(step => step.action),
      type: 'confirmation',
      confidence: intent.confidence,
      metadata: {
        actionPlan,
        requiresConfirmation: actionPlan.requiresConfirmation,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Generate response for form filling intents
   */
  private async generateFormFillResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const formElements = pageContext?.elements.filter(e => 
      e.tagName === 'input' || e.tagName === 'select' || e.tagName === 'textarea'
    ) || [];

    const actions = await this.generateFormActions(intent, formElements);
    
    const message = `I'll help you fill out this form. I found ${formElements.length} form fields to complete.`;

    return {
      id: uuidv4(),
      message,
      actions,
      type: 'action_plan',
      confidence: intent.confidence,
      timestamp: new Date(),
    };
  }

  /**
   * Generate response for search intents
   */
  private async generateSearchResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<AIResponse> {
    const searchQuery = intent.parameters?.query || userMessage;
    const searchElements = pageContext?.elements.filter(e => 
      e.tagName === 'input' && (e.type === 'search' || e.type === 'text')
    ) || [];

    let message: string;
    let actions: BrowserAction[] = [];

    if (searchElements.length > 0) {
      actions = await this.generateSearchActions(searchQuery, searchElements);
      message = `I'll search for "${searchQuery}" using the search box on this page.`;
    } else {
      message = `I couldn't find a search box on this page. You might need to navigate to a search page first.`;
    }

    return {
      id: uuidv4(),
      message,
      actions,
      type: actions.length > 0 ? 'action_plan' : 'chat',
      confidence: intent.confidence,
      timestamp: new Date(),
    };
  }

  /**
   * Generate response for question intents
   */
  private async generateQuestionResponse(
    userMessage: string,
    intent: UserIntent,
    pageContext?: PageContext,
    conversationHistory?: string[]
  ): Promise<AIResponse> {
    const prompt = this.buildQuestionPrompt(pageContext, conversationHistory);
    
    const aiResponse = await this.nvidiaClient.sendPrimaryRequest([
      { role: 'system', content: prompt },
      { role: 'user', content: userMessage },
    ], { max_tokens: 600 });

    const message = aiResponse.choices[0]?.message?.content || 'I\'m here to help with your browser automation needs.';

    return {
      id: uuidv4(),
      message,
      type: 'chat',
      confidence: intent.confidence,
      suggestions: this.generateQuestionSuggestions(pageContext),
      timestamp: new Date(),
    };
  }

  /**
   * Generate browser actions for different intent types
   */
  private async generateInteractionActions(
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<BrowserAction[]> {
    const actions: BrowserAction[] = [];

    if (intent.action === 'click' && intent.targets?.length) {
      for (const target of intent.targets) {
        const element = this.findElementByTarget(target, pageContext);
        if (element) {
          actions.push({
            id: uuidv4(),
            type: 'click',
            target: {
              css: element.selector,
              strategy: ['css', 'xpath', 'text'],
            },
            description: `Click ${element.text || element.tagName}`,
            options: {
              waitForVisible: true,
              highlight: true,
              timeout: 5000,
            },
          });
        }
      }
    }

    if (intent.action === 'type' && intent.parameters?.text) {
      const inputElements = pageContext?.elements.filter(e => 
        e.tagName === 'input' && e.visible
      ) || [];

      if (inputElements.length > 0) {
        actions.push({
          id: uuidv4(),
          type: 'type',
          target: {
            css: inputElements[0].selector,
            strategy: ['css'],
          },
          value: intent.parameters.text,
          description: `Type "${intent.parameters.text}"`,
          options: {
            waitForVisible: true,
            timeout: 5000,
          },
        });
      }
    }

    return actions;
  }

  private async generateNavigationActions(
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<BrowserAction[]> {
    const actions: BrowserAction[] = [];

    switch (intent.action) {
      case 'navigate':
        if (intent.parameters?.url) {
          actions.push({
            id: uuidv4(),
            type: 'navigate',
            value: intent.parameters.url,
            description: `Navigate to ${intent.parameters.url}`,
            options: { timeout: 30000 },
          });
        }
        break;

      case 'back':
        actions.push({
          id: uuidv4(),
          type: 'back',
          description: 'Go back to previous page',
        });
        break;

      case 'forward':
        actions.push({
          id: uuidv4(),
          type: 'forward',
          description: 'Go forward to next page',
        });
        break;

      case 'reload':
        actions.push({
          id: uuidv4(),
          type: 'reload',
          description: 'Reload current page',
        });
        break;

      case 'scroll':
        actions.push({
          id: uuidv4(),
          type: 'scroll',
          value: intent.parameters?.direction || 'down',
          description: `Scroll ${intent.parameters?.direction || 'down'}`,
        });
        break;
    }

    return actions;
  }

  private async generateExtractionActions(
    intent: UserIntent,
    pageContext?: PageContext
  ): Promise<BrowserAction[]> {
    const actions: BrowserAction[] = [];

    // Take screenshot first for visual reference
    actions.push({
      id: uuidv4(),
      type: 'screenshot',
      description: 'Capture page screenshot',
    });

    // Extract data based on intent parameters
    if (intent.parameters?.dataType === 'structured') {
      // Extract table or list data
      const tables = pageContext?.elements.filter(e => e.tagName === 'table') || [];
      const lists = pageContext?.elements.filter(e => e.tagName === 'ul' || e.tagName === 'ol') || [];

      [...tables, ...lists].forEach(element => {
        actions.push({
          id: uuidv4(),
          type: 'extract',
          target: {
            css: element.selector,
            strategy: ['css'],
          },
          description: `Extract data from ${element.tagName}`,
        });
      });
    } else {
      // Extract general text content
      actions.push({
        id: uuidv4(),
        type: 'extract',
        target: {
          css: 'body',
          strategy: ['css'],
        },
        description: 'Extract page content',
      });
    }

    return actions;
  }

  /**
   * Helper methods
   */
  private findElementByTarget(target: string, pageContext?: PageContext) {
    if (!pageContext) return null;

    return pageContext.elements.find(element => 
      element.text.toLowerCase().includes(target.toLowerCase()) ||
      element.selector.includes(target) ||
      element.attributes.id === target ||
      element.attributes.class?.includes(target)
    );
  }

  private getModelForIntent(intent: UserIntent): string {
    switch (intent.category) {
      case 'automation':
      case 'analysis':
        return 'complex'; // Use 405B model for complex tasks
      case 'extraction':
      case 'form_fill':
        return 'primary'; // Use 70B model for standard tasks
      default:
        return 'primary';
    }
  }

  private generateSuggestions(intent: UserIntent, pageContext?: PageContext): string[] {
    const suggestions: string[] = [];

    if (pageContext?.metadata.hasForms) {
      suggestions.push('Fill out the form on this page');
    }

    if (pageContext?.elements.some(e => e.tagName === 'a')) {
      suggestions.push('Click on a specific link');
    }

    if (pageContext?.elements.some(e => e.tagName === 'button')) {
      suggestions.push('Click a button to perform an action');
    }

    suggestions.push('Extract data from this page');
    suggestions.push('Take a screenshot');

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  private generateErrorResponse(errorMessage: string): AIResponse {
    return {
      id: uuidv4(),
      message: `I encountered an error: ${errorMessage}. Please try rephrasing your request or check if the page has loaded completely.`,
      type: 'error',
      confidence: 0,
      timestamp: new Date(),
    };
  }

  // Additional helper methods for building prompts and generating specific action types...
  private buildActionPrompt(userMessage: string, actions: BrowserAction[], pageContext?: PageContext): string {
    return `You are helping a user automate browser actions. The user wants to: ${userMessage}

I've prepared ${actions.length} actions to execute:
${actions.map((action, i) => `${i + 1}. ${action.description}`).join('\n')}

Current page: ${pageContext?.url || 'Unknown'}
Page title: ${pageContext?.title || 'Unknown'}

Provide a clear, helpful response explaining what you'll do and ask for confirmation if needed.`;
  }

  private buildAnalysisPrompt(pageContext?: PageContext): string {
    if (!pageContext) {
      return 'Analyze the current webpage and provide insights about its content and functionality.';
    }

    return `Analyze this webpage:

URL: ${pageContext.url}
Title: ${pageContext.title}
Loading state: ${pageContext.metadata.loadingState}
Has forms: ${pageContext.metadata.hasForms}
Interactive elements: ${pageContext.elements.filter(e => e.interactive).length}

Content preview:
${pageContext.content.substring(0, 500)}...

Provide insights about the page's purpose, main features, and what actions users can take.`;
  }

  private buildQuestionPrompt(pageContext?: PageContext, history?: string[]): string {
    let prompt = 'You are a helpful browser automation assistant. Answer questions about web browsing, automation, and the current page.';

    if (pageContext) {
      prompt += `\n\nCurrent page: ${pageContext.url}
Title: ${pageContext.title}
Content: ${pageContext.content.substring(0, 300)}...`;
    }

    if (history?.length) {
      prompt += `\n\nRecent conversation:
${history.slice(-3).join('\n')}`;
    }

    return prompt;
  }

  private generateAnalysisSuggestions(pageContext?: PageContext): string[] {
    const suggestions = ['Summarize the main content'];
    
    if (pageContext?.metadata.hasForms) {
      suggestions.push('Help me fill out the form');
    }
    
    if (pageContext?.elements.some(e => e.tagName === 'table')) {
      suggestions.push('Extract data from tables');
    }

    return suggestions;
  }

  private generateQuestionSuggestions(pageContext?: PageContext): string[] {
    return [
      'What can I do on this page?',
      'Help me navigate to another page',
      'Extract information from this page',
      'Take a screenshot',
    ];
  }

  // Placeholder methods for complex action generation
  private async generateActionPlan(userMessage: string, intent: UserIntent, pageContext?: PageContext): Promise<ActionPlan> {
    // This would be implemented with more sophisticated planning logic
    return {
      id: uuidv4(),
      description: `Complete the requested automation: ${userMessage}`,
      steps: [],
      estimatedTime: 30000,
      riskLevel: 'medium',
      requiresConfirmation: true,
    };
  }

  private async generateFormActions(intent: UserIntent, formElements: any[]): Promise<BrowserAction[]> {
    // Implementation for form filling actions
    return [];
  }

  private async generateSearchActions(query: string, searchElements: any[]): Promise<BrowserAction[]> {
    // Implementation for search actions
    return [];
  }

  private getNavigationMessage(intent: UserIntent, actions: BrowserAction[]): string {
    if (actions.length === 0) {
      return 'I couldn\'t determine how to navigate. Please provide more specific instructions.';
    }

    return `I'll ${actions[0].description.toLowerCase()} for you.`;
  }
}