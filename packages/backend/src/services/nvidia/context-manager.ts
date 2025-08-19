import { 
  PageContext, 
  Message, 
  UserSession, 
  NVIDIAMessage 
} from '@browser-ai-agent/shared';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface ConversationContext {
  sessionId: string;
  messages: Message[];
  pageContext?: PageContext;
  userPreferences: any;
  metadata: Record<string, any>;
}

export class ContextManager {
  private readonly logger: Logger;
  private readonly contexts: Map<string, ConversationContext>;
  private readonly maxHistoryLength: number;

  constructor(maxHistoryLength: number = 50) {
    this.logger = createLogger('ContextManager');
    this.contexts = new Map();
    this.maxHistoryLength = maxHistoryLength;
  }

  /**
   * Initialize context for a new session
   */
  initializeContext(session: UserSession): void {
    const context: ConversationContext = {
      sessionId: session.id,
      messages: session.conversationHistory || [],
      pageContext: session.browserState?.pageContext,
      userPreferences: session.preferences,
      metadata: {
        userId: session.userId,
        createdAt: session.createdAt,
        deviceInfo: session.metadata?.device,
      },
    };

    this.contexts.set(session.id, context);
    this.logger.debug('Context initialized', { sessionId: session.id });
  }

  /**
   * Update page context for a session
   */
  updatePageContext(sessionId: string, pageContext: PageContext): void {
    const context = this.contexts.get(sessionId);
    if (!context) {
      this.logger.warn('Context not found for page update', { sessionId });
      return;
    }

    context.pageContext = pageContext;
    context.metadata.lastPageUpdate = new Date();
    
    this.logger.debug('Page context updated', { 
      sessionId, 
      url: pageContext.url,
      title: pageContext.title 
    });
  }

  /**
   * Add a message to the conversation history
   */
  addMessage(sessionId: string, message: Message): void {
    const context = this.contexts.get(sessionId);
    if (!context) {
      this.logger.warn('Context not found for message', { sessionId });
      return;
    }

    context.messages.push(message);
    
    // Trim history if it exceeds max length
    if (context.messages.length > this.maxHistoryLength) {
      const removed = context.messages.splice(0, context.messages.length - this.maxHistoryLength);
      this.logger.debug('Trimmed conversation history', { 
        sessionId, 
        removedCount: removed.length 
      });
    }

    this.logger.debug('Message added to context', { 
      sessionId, 
      messageType: message.type,
      sender: message.sender 
    });
  }

  /**
   * Get conversation context for AI processing
   */
  getContext(sessionId: string): ConversationContext | null {
    return this.contexts.get(sessionId) || null;
  }

  /**
   * Convert conversation context to NVIDIA API messages
   */
  buildNVIDIAMessages(
    sessionId: string, 
    userMessage: string,
    includePageContext: boolean = true,
    includeHistory: boolean = true
  ): NVIDIAMessage[] {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new Error(`Context not found for session: ${sessionId}`);
    }

    const messages: NVIDIAMessage[] = [];

    // System message with context
    const systemPrompt = this.buildSystemPrompt(context, includePageContext);
    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Include conversation history if requested
    if (includeHistory && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-10); // Last 10 messages
      
      for (const msg of recentMessages) {
        if (msg.type === 'text' || msg.type === 'command' || msg.type === 'response') {
          messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.content,
            metadata: {
              messageId: msg.id,
              timestamp: msg.timestamp,
              type: msg.type,
            },
          });
        }
      }
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
      metadata: {
        timestamp: new Date(),
        pageUrl: context.pageContext?.url,
      },
    });

    this.logger.debug('Built NVIDIA messages', { 
      sessionId, 
      messageCount: messages.length,
      includePageContext,
      includeHistory 
    });

    return messages;
  }

  /**
   * Build system prompt with context information
   */
  private buildSystemPrompt(
    context: ConversationContext, 
    includePageContext: boolean
  ): string {
    let prompt = `You are a Browser AI Agent assistant that helps users automate web browsing tasks. You can:

1. Understand natural language commands about web interactions
2. Analyze webpage content and structure
3. Generate browser automation actions (click, type, scroll, navigate, etc.)
4. Extract and summarize information from web pages
5. Provide helpful responses and suggestions

Key capabilities:
- Click buttons, links, and interactive elements
- Fill out forms and input fields
- Navigate between pages and scroll content
- Extract data from tables, lists, and text
- Take screenshots and analyze visual content
- Handle errors and provide recovery suggestions

Response format:
- Provide clear, helpful responses
- When automation is needed, explain what you'll do before acting
- Ask for confirmation for potentially destructive actions
- Offer alternatives when tasks cannot be completed

User preferences:
${JSON.stringify(context.userPreferences, null, 2)}`;

    if (includePageContext && context.pageContext) {
      const page = context.pageContext;
      prompt += `

Current page context:
- URL: ${page.url}
- Title: ${page.title}
- Loading state: ${page.metadata.loadingState}
- Has forms: ${page.metadata.hasForms}
- Interactive elements: ${page.elements.filter(e => e.interactive).length}
- Total elements: ${page.elements.length}

Page content summary:
${page.content.substring(0, 1000)}${page.content.length > 1000 ? '...' : ''}

Available interactive elements:
${page.elements
  .filter(e => e.interactive && e.visible)
  .slice(0, 20) // Limit to first 20 elements
  .map(e => `- ${e.tagName}${e.type ? `[${e.type}]` : ''}: "${e.text}" (${e.selector})`)
  .join('\n')}`;
    }

    return prompt;
  }

  /**
   * Build specialized prompt for vision tasks
   */
  buildVisionPrompt(
    sessionId: string,
    userMessage: string,
    screenshotData?: string
  ): NVIDIAMessage[] {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new Error(`Context not found for session: ${sessionId}`);
    }

    const messages: NVIDIAMessage[] = [];

    // System message for vision tasks
    messages.push({
      role: 'system',
      content: `You are a Browser AI Agent with vision capabilities. You can analyze screenshots of web pages to:

1. Identify interactive elements (buttons, links, forms, etc.)
2. Read text content and understand page layout
3. Locate specific elements by visual appearance
4. Understand the current state of the page
5. Generate precise selectors for automation

When analyzing screenshots:
- Describe what you see clearly
- Identify clickable elements and their locations
- Suggest specific actions based on visual content
- Provide CSS selectors or XPath when possible
- Note any errors, loading states, or important visual cues

Current page: ${context.pageContext?.url || 'Unknown'}`,
    });

    // Add user message with screenshot if provided
    const userContent = screenshotData 
      ? `${userMessage}\n\n[Screenshot provided for analysis]`
      : userMessage;

    messages.push({
      role: 'user',
      content: userContent,
      metadata: {
        hasScreenshot: !!screenshotData,
        pageUrl: context.pageContext?.url,
        timestamp: new Date(),
      },
    });

    return messages;
  }

  /**
   * Clean up context for a session
   */
  removeContext(sessionId: string): void {
    const removed = this.contexts.delete(sessionId);
    if (removed) {
      this.logger.debug('Context removed', { sessionId });
    }
  }

  /**
   * Get context statistics
   */
  getStats(): {
    totalContexts: number;
    averageMessageCount: number;
    oldestContext: Date | null;
  } {
    const contexts = Array.from(this.contexts.values());
    
    return {
      totalContexts: contexts.length,
      averageMessageCount: contexts.length > 0 
        ? contexts.reduce((sum, ctx) => sum + ctx.messages.length, 0) / contexts.length 
        : 0,
      oldestContext: contexts.length > 0
        ? new Date(Math.min(...contexts.map(ctx => new Date(ctx.metadata.createdAt).getTime())))
        : null,
    };
  }

  /**
   * Cleanup old contexts
   */
  cleanup(maxAge: number = 3600000): number { // 1 hour default
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, context] of this.contexts.entries()) {
      const age = now - new Date(context.metadata.createdAt).getTime();
      if (age > maxAge) {
        this.contexts.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info('Cleaned up old contexts', { cleaned });
    }

    return cleaned;
  }
}