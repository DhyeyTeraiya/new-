import { 
  UserIntent, 
  IntentCategory, 
  PageContext,
  BrowserAction,
  BrowserActionType 
} from '@browser-ai-agent/shared';
import { NVIDIAClient } from './nvidia-client';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export class IntentClassifier {
  private readonly logger: Logger;
  private readonly nvidiaClient: NVIDIAClient;

  constructor(nvidiaClient: NVIDIAClient) {
    this.logger = createLogger('IntentClassifier');
    this.nvidiaClient = nvidiaClient;
  }

  /**
   * Classify user intent from natural language
   */
  async classifyIntent(
    userMessage: string,
    pageContext?: PageContext
  ): Promise<UserIntent> {
    const startTime = Date.now();

    try {
      // First, try rule-based classification for common patterns
      const ruleBasedIntent = this.classifyWithRules(userMessage, pageContext);
      if (ruleBasedIntent.confidence > 0.8) {
        this.logger.debug('Intent classified with rules', { 
          category: ruleBasedIntent.category,
          confidence: ruleBasedIntent.confidence,
          processingTime: Date.now() - startTime 
        });
        return ruleBasedIntent;
      }

      // Use AI for complex intent classification
      const aiIntent = await this.classifyWithAI(userMessage, pageContext);
      
      this.logger.debug('Intent classified with AI', { 
        category: aiIntent.category,
        confidence: aiIntent.confidence,
        processingTime: Date.now() - startTime 
      });

      return aiIntent;
    } catch (error) {
      this.logger.error('Intent classification failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userMessage: userMessage.substring(0, 100) 
      });

      // Fallback to basic classification
      return this.getFallbackIntent(userMessage);
    }
  }

  /**
   * Rule-based intent classification for common patterns
   */
  private classifyWithRules(
    userMessage: string,
    pageContext?: PageContext
  ): UserIntent {
    const message = userMessage.toLowerCase().trim();

    // Navigation intents
    if (this.matchesPatterns(message, [
      /go to|navigate to|visit|open/,
      /back|forward|reload|refresh/,
      /scroll (up|down|to)/
    ])) {
      return {
        category: 'navigation',
        action: this.extractNavigationAction(message),
        confidence: 0.9,
        parameters: this.extractNavigationParameters(message),
      };
    }

    // Interaction intents
    if (this.matchesPatterns(message, [
      /click|press|tap/,
      /type|enter|input|fill/,
      /select|choose|pick/,
      /submit|send/
    ])) {
      return {
        category: 'interaction',
        action: this.extractInteractionAction(message),
        confidence: 0.85,
        parameters: this.extractInteractionParameters(message, pageContext),
        targets: this.extractTargets(message, pageContext),
      };
    }

    // Extraction intents
    if (this.matchesPatterns(message, [
      /extract|get|find|scrape/,
      /download|save|export/,
      /copy|grab|collect/
    ])) {
      return {
        category: 'extraction',
        action: this.extractExtractionAction(message),
        confidence: 0.8,
        parameters: this.extractExtractionParameters(message),
        targets: this.extractTargets(message, pageContext),
      };
    }

    // Form filling intents
    if (this.matchesPatterns(message, [
      /fill (out|in)|complete the form/,
      /sign up|register|login|log in/,
      /checkout|purchase|buy/
    ])) {
      return {
        category: 'form_fill',
        action: this.extractFormAction(message),
        confidence: 0.85,
        parameters: this.extractFormParameters(message),
      };
    }

    // Analysis intents
    if (this.matchesPatterns(message, [
      /analyze|examine|check/,
      /what (is|does|can)/,
      /how (to|do|can)/,
      /summarize|summary/
    ])) {
      return {
        category: 'analysis',
        action: 'analyze_page',
        confidence: 0.7,
        parameters: { analysisType: this.extractAnalysisType(message) },
      };
    }

    // Search intents
    if (this.matchesPatterns(message, [
      /search for|look for|find/,
      /where is|locate/
    ])) {
      return {
        category: 'search',
        action: 'search',
        confidence: 0.75,
        parameters: { query: this.extractSearchQuery(message) },
      };
    }

    // Default to question if no clear intent
    return {
      category: 'question',
      action: 'answer_question',
      confidence: 0.5,
      parameters: { question: userMessage },
    };
  }

  /**
   * AI-powered intent classification for complex cases
   */
  private async classifyWithAI(
    userMessage: string,
    pageContext?: PageContext
  ): Promise<UserIntent> {
    const prompt = this.buildClassificationPrompt(userMessage, pageContext);
    
    const response = await this.nvidiaClient.sendPrimaryRequest([
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content: `Classify this user request: "${userMessage}"`,
      },
    ], {
      max_tokens: 500,
      temperature: 0.1, // Low temperature for consistent classification
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI classification');
    }

    return this.parseAIClassification(content, userMessage);
  }

  /**
   * Build classification prompt for AI
   */
  private buildClassificationPrompt(
    userMessage: string,
    pageContext?: PageContext
  ): string {
    let prompt = `You are an expert at classifying user intents for browser automation. 

Classify the user's request into one of these categories:
- navigation: Moving around pages (go to URL, scroll, back/forward)
- interaction: Interacting with elements (click, type, select)
- extraction: Getting data from pages (extract text, download, copy)
- analysis: Understanding page content (analyze, summarize, explain)
- automation: Multi-step workflows (complete process, automate task)
- question: Asking about page or general questions
- search: Looking for specific information or elements
- form_fill: Filling out forms, login, registration

For each classification, provide:
1. Category (one of the above)
2. Specific action description
3. Confidence score (0.0-1.0)
4. Target elements (if applicable)
5. Parameters (additional details)

Respond in JSON format:
{
  "category": "interaction",
  "action": "click_button",
  "confidence": 0.9,
  "targets": ["submit button", "login button"],
  "parameters": {
    "element_type": "button",
    "action_type": "click"
  }
}`;

    if (pageContext) {
      prompt += `\n\nCurrent page context:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Interactive elements: ${pageContext.elements.filter(e => e.interactive).length}
- Has forms: ${pageContext.metadata.hasForms}

Available elements:
${pageContext.elements
  .filter(e => e.interactive && e.visible)
  .slice(0, 10)
  .map(e => `- ${e.tagName}: "${e.text}" (${e.selector})`)
  .join('\n')}`;
    }

    return prompt;
  }

  /**
   * Parse AI classification response
   */
  private parseAIClassification(content: string, originalMessage: string): UserIntent {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        category: parsed.category as IntentCategory,
        action: parsed.action || 'unknown',
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        targets: parsed.targets || [],
        parameters: parsed.parameters || {},
      };
    } catch (error) {
      this.logger.warn('Failed to parse AI classification', { 
        content: content.substring(0, 200),
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      return this.getFallbackIntent(originalMessage);
    }
  }

  /**
   * Helper methods for rule-based classification
   */
  private matchesPatterns(message: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(message));
  }

  private extractNavigationAction(message: string): string {
    if (/go to|navigate to|visit|open/.test(message)) return 'navigate';
    if (/back/.test(message)) return 'back';
    if (/forward/.test(message)) return 'forward';
    if (/reload|refresh/.test(message)) return 'reload';
    if (/scroll/.test(message)) return 'scroll';
    return 'navigate';
  }

  private extractInteractionAction(message: string): string {
    if (/click|press|tap/.test(message)) return 'click';
    if (/type|enter|input|fill/.test(message)) return 'type';
    if (/select|choose|pick/.test(message)) return 'select';
    if (/submit|send/.test(message)) return 'submit';
    return 'click';
  }

  private extractExtractionAction(message: string): string {
    if (/download|save/.test(message)) return 'download';
    if (/copy|grab/.test(message)) return 'copy';
    if (/extract|get|scrape/.test(message)) return 'extract';
    return 'extract';
  }

  private extractFormAction(message: string): string {
    if (/sign up|register/.test(message)) return 'register';
    if (/login|log in/.test(message)) return 'login';
    if (/checkout|purchase|buy/.test(message)) return 'checkout';
    return 'fill_form';
  }

  private extractAnalysisType(message: string): string {
    if (/summarize|summary/.test(message)) return 'summarize';
    if (/what is/.test(message)) return 'explain';
    if (/how to/.test(message)) return 'instructions';
    return 'general';
  }

  private extractSearchQuery(message: string): string {
    const match = message.match(/(?:search for|look for|find)\s+(.+)/);
    return match ? match[1] : message;
  }

  private extractNavigationParameters(message: string): Record<string, any> {
    const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      return { url: urlMatch[1] };
    }

    const scrollMatch = message.match(/scroll\s+(up|down|to\s+(.+))/);
    if (scrollMatch) {
      return { 
        direction: scrollMatch[1].includes('up') ? 'up' : 'down',
        target: scrollMatch[2] || null 
      };
    }

    return {};
  }

  private extractInteractionParameters(
    message: string, 
    pageContext?: PageContext
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract text to type
    const typeMatch = message.match(/type|enter|input\s+["']([^"']+)["']/);
    if (typeMatch) {
      params.text = typeMatch[1];
    }

    return params;
  }

  private extractExtractionParameters(message: string): Record<string, any> {
    const params: Record<string, any> = {};

    if (/table|list/.test(message)) {
      params.dataType = 'structured';
    } else if (/text|content/.test(message)) {
      params.dataType = 'text';
    } else if (/link|url/.test(message)) {
      params.dataType = 'links';
    }

    return params;
  }

  private extractFormParameters(message: string): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract form data patterns
    const emailMatch = message.match(/email[:\s]+([^\s]+)/);
    if (emailMatch) {
      params.email = emailMatch[1];
    }

    const nameMatch = message.match(/name[:\s]+([^\s]+(?:\s+[^\s]+)*)/);
    if (nameMatch) {
      params.name = nameMatch[1];
    }

    return params;
  }

  private extractTargets(
    message: string, 
    pageContext?: PageContext
  ): string[] {
    const targets: string[] = [];

    // Extract quoted targets
    const quotedMatches = message.match(/["']([^"']+)["']/g);
    if (quotedMatches) {
      targets.push(...quotedMatches.map(m => m.slice(1, -1)));
    }

    // Extract common element references
    const elementMatches = message.match(/\b(button|link|input|form|menu|dropdown)\b/g);
    if (elementMatches) {
      targets.push(...elementMatches);
    }

    return targets;
  }

  private getFallbackIntent(userMessage: string): UserIntent {
    return {
      category: 'question',
      action: 'answer_question',
      confidence: 0.3,
      parameters: { question: userMessage },
    };
  }
}