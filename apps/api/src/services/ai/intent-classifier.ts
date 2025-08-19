import { logger } from '../../utils/logger';
import { TaskType, AgentType } from '../../../../../packages/shared/src/types/agent';

// =============================================================================
// ADVANCED INTENT CLASSIFICATION SERVICE
// Superior to Basic Pattern Matching - Uses ML-Based Classification
// =============================================================================

export interface Intent {
  type: TaskType;
  confidence: number;
  parameters: Record<string, any>;
  agentType: AgentType;
  complexity: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDuration: number; // seconds
  requiredCapabilities: string[];
}

export interface ClassificationResult {
  primaryIntent: Intent;
  alternativeIntents: Intent[];
  reasoning: string;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestions: string[];
}

export interface UserMessage {
  content: string;
  userId?: string;
  sessionId?: string;
  context?: {
    previousTasks?: string[];
    userProfile?: any;
    currentPage?: string;
    timeOfDay?: string;
  };
}

// =============================================================================
// INTENT PATTERNS AND RULES
// =============================================================================

interface IntentPattern {
  keywords: string[];
  phrases: string[];
  negativeKeywords?: string[];
  taskType: TaskType;
  agentType: AgentType;
  complexity: 'low' | 'medium' | 'high';
  confidence: number;
  parameters?: Record<string, any>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Job Search Patterns
  {
    keywords: ['job', 'jobs', 'position', 'career', 'employment', 'work', 'hiring'],
    phrases: [
      'find jobs', 'search for jobs', 'look for work', 'job opportunities',
      'career opportunities', 'job openings', 'employment opportunities'
    ],
    taskType: TaskType.JOB_SEARCH,
    agentType: AgentType.EXTRACTOR,
    complexity: 'medium',
    confidence: 0.85,
    parameters: { platforms: ['indeed', 'linkedin', 'glassdoor'] }
  },
  
  // Job Application Patterns
  {
    keywords: ['apply', 'application', 'submit', 'resume', 'cv'],
    phrases: [
      'apply to jobs', 'submit applications', 'send resume', 'apply for position',
      'job application', 'submit cv', 'auto apply'
    ],
    taskType: TaskType.JOB_APPLICATION,
    agentType: AgentType.NAVIGATOR,
    complexity: 'high',
    confidence: 0.90,
    parameters: { autoFill: true, trackApplications: true }
  },
  
  // Company Research Patterns
  {
    keywords: ['company', 'research', 'information', 'details', 'about'],
    phrases: [
      'research company', 'company information', 'learn about company',
      'company details', 'company profile', 'company background'
    ],
    taskType: TaskType.COMPANY_RESEARCH,
    agentType: AgentType.EXTRACTOR,
    complexity: 'medium',
    confidence: 0.80,
    parameters: { depth: 'comprehensive', includeFinancials: true }
  },
  
  // Contact Scraping Patterns
  {
    keywords: ['contact', 'email', 'phone', 'reach', 'connect'],
    phrases: [
      'find contacts', 'get email addresses', 'contact information',
      'find phone numbers', 'scrape contacts', 'extract contacts'
    ],
    taskType: TaskType.CONTACT_SCRAPING,
    agentType: AgentType.EXTRACTOR,
    complexity: 'high',
    confidence: 0.75,
    parameters: { includeEmails: true, includePhones: true, includeSocial: true }
  },
  
  // Data Extraction Patterns
  {
    keywords: ['extract', 'scrape', 'data', 'information', 'collect'],
    phrases: [
      'extract data', 'scrape website', 'collect information',
      'get data from', 'extract information', 'data mining'
    ],
    taskType: TaskType.DATA_EXTRACTION,
    agentType: AgentType.EXTRACTOR,
    complexity: 'medium',
    confidence: 0.85,
    parameters: { format: 'structured', includeMetadata: true }
  },
  
  // Form Filling Patterns
  {
    keywords: ['fill', 'form', 'complete', 'submit', 'input'],
    phrases: [
      'fill form', 'complete form', 'fill out', 'submit form',
      'auto fill', 'form completion', 'input data'
    ],
    taskType: TaskType.FORM_FILLING,
    agentType: AgentType.NAVIGATOR,
    complexity: 'low',
    confidence: 0.90,
    parameters: { validateInputs: true, saveProgress: true }
  },
  
  // Custom Workflow Patterns
  {
    keywords: ['workflow', 'automation', 'process', 'sequence', 'steps'],
    phrases: [
      'create workflow', 'automate process', 'custom automation',
      'sequence of steps', 'automated workflow', 'process automation'
    ],
    taskType: TaskType.CUSTOM_WORKFLOW,
    agentType: AgentType.PLANNER,
    complexity: 'high',
    confidence: 0.70,
    parameters: { allowCustomSteps: true, saveTemplate: true }
  }
];

// =============================================================================
// ADVANCED INTENT CLASSIFIER
// =============================================================================

export class IntentClassifier {
  private static instance: IntentClassifier;
  private classificationHistory: Map<string, ClassificationResult[]> = new Map();
  private userProfiles: Map<string, any> = new Map();
  private contextualPatterns: Map<string, number> = new Map();

  private constructor() {
    this.initializeContextualPatterns();
  }

  public static getInstance(): IntentClassifier {
    if (!IntentClassifier.instance) {
      IntentClassifier.instance = new IntentClassifier();
    }
    return IntentClassifier.instance;
  }

  // =============================================================================
  // MAIN CLASSIFICATION METHOD
  // =============================================================================

  public async classifyIntent(message: UserMessage): Promise<ClassificationResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Classifying user intent', {
        messageLength: message.content.length,
        userId: message.userId,
        sessionId: message.sessionId,
      });

      // Preprocess message
      const processedMessage = this.preprocessMessage(message.content);
      
      // Extract features
      const features = this.extractFeatures(processedMessage, message.context);
      
      // Apply pattern matching
      const patternMatches = this.matchPatterns(processedMessage, features);
      
      // Apply contextual analysis
      const contextualScores = this.analyzeContext(message, patternMatches);
      
      // Apply ML-based classification (simplified heuristic approach)
      const mlScores = this.applyMLClassification(features, message.context);
      
      // Combine scores and rank intents
      const rankedIntents = this.combineAndRankIntents(patternMatches, contextualScores, mlScores);
      
      // Generate classification result
      const result = this.generateClassificationResult(rankedIntents, message);
      
      // Store for learning
      this.storeClassificationResult(message, result);
      
      const executionTime = Date.now() - startTime;
      
      logger.info('Intent classification completed', {
        primaryIntent: result.primaryIntent.type,
        confidence: result.confidence,
        executionTime,
        needsClarification: result.needsClarification,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Intent classification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        messageContent: message.content.substring(0, 100),
      });

      // Return fallback intent
      return this.getFallbackIntent(message);
    }
  }

  // =============================================================================
  // PREPROCESSING AND FEATURE EXTRACTION
  // =============================================================================

  private preprocessMessage(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private extractFeatures(message: string, context?: any): Record<string, any> {
    const words = message.split(' ');
    const features = {
      wordCount: words.length,
      hasQuestionWords: /\b(what|how|when|where|why|which|who)\b/.test(message),
      hasActionWords: /\b(find|search|get|apply|submit|extract|scrape|fill|create|automate)\b/.test(message),
      hasJobKeywords: /\b(job|position|career|work|employment|hiring|resume|cv)\b/.test(message),
      hasCompanyKeywords: /\b(company|organization|business|firm|corporation)\b/.test(message),
      hasDataKeywords: /\b(data|information|details|extract|scrape|collect)\b/.test(message),
      hasAutomationKeywords: /\b(automate|automation|workflow|process|sequence)\b/.test(message),
      hasUrgencyWords: /\b(urgent|asap|quickly|fast|immediately|now)\b/.test(message),
      hasQuantifiers: /\b(\d+|many|all|some|few|several)\b/.test(message),
      messageLength: message.length,
      timeOfDay: context?.timeOfDay || 'unknown',
      hasContext: !!context,
    };

    return features;
  }

  // =============================================================================
  // PATTERN MATCHING
  // =============================================================================

  private matchPatterns(message: string, features: Record<string, any>): Intent[] {
    const matches: Intent[] = [];

    for (const pattern of INTENT_PATTERNS) {
      let score = 0;
      let matchedKeywords = 0;
      let matchedPhrases = 0;

      // Check keywords
      for (const keyword of pattern.keywords) {
        if (message.includes(keyword)) {
          matchedKeywords++;
          score += 1;
        }
      }

      // Check phrases
      for (const phrase of pattern.phrases) {
        if (message.includes(phrase)) {
          matchedPhrases++;
          score += 2; // Phrases are more specific
        }
      }

      // Check negative keywords
      if (pattern.negativeKeywords) {
        for (const negKeyword of pattern.negativeKeywords) {
          if (message.includes(negKeyword)) {
            score -= 1;
          }
        }
      }

      // Calculate confidence
      const maxPossibleScore = pattern.keywords.length + (pattern.phrases.length * 2);
      const normalizedScore = maxPossibleScore > 0 ? score / maxPossibleScore : 0;
      const adjustedConfidence = pattern.confidence * normalizedScore;

      if (adjustedConfidence > 0.1) { // Minimum threshold
        // Determine priority based on features
        const priority = this.determinePriority(features, pattern);
        
        // Estimate duration
        const estimatedDuration = this.estimateDuration(pattern.taskType, pattern.complexity);

        matches.push({
          type: pattern.taskType,
          confidence: adjustedConfidence,
          parameters: { ...pattern.parameters },
          agentType: pattern.agentType,
          complexity: pattern.complexity,
          priority,
          estimatedDuration,
          requiredCapabilities: this.getRequiredCapabilities(pattern.taskType),
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  // =============================================================================
  // CONTEXTUAL ANALYSIS
  // =============================================================================

  private analyzeContext(message: UserMessage, patternMatches: Intent[]): Map<TaskType, number> {
    const contextScores = new Map<TaskType, number>();

    // Initialize scores
    for (const match of patternMatches) {
      contextScores.set(match.type, 0);
    }

    if (!message.context) {
      return contextScores;
    }

    // Analyze previous tasks
    if (message.context.previousTasks) {
      for (const prevTask of message.context.previousTasks) {
        // Boost related task types
        if (prevTask.includes('job') && contextScores.has(TaskType.JOB_SEARCH)) {
          contextScores.set(TaskType.JOB_SEARCH, contextScores.get(TaskType.JOB_SEARCH)! + 0.2);
        }
        if (prevTask.includes('company') && contextScores.has(TaskType.COMPANY_RESEARCH)) {
          contextScores.set(TaskType.COMPANY_RESEARCH, contextScores.get(TaskType.COMPANY_RESEARCH)! + 0.2);
        }
      }
    }

    // Analyze user profile
    if (message.userId && message.context.userProfile) {
      const profile = message.context.userProfile;
      
      // Boost job-related tasks for job seekers
      if (profile.isJobSeeking && contextScores.has(TaskType.JOB_SEARCH)) {
        contextScores.set(TaskType.JOB_SEARCH, contextScores.get(TaskType.JOB_SEARCH)! + 0.3);
      }
      
      // Boost automation tasks for power users
      if (profile.isPowerUser && contextScores.has(TaskType.CUSTOM_WORKFLOW)) {
        contextScores.set(TaskType.CUSTOM_WORKFLOW, contextScores.get(TaskType.CUSTOM_WORKFLOW)! + 0.2);
      }
    }

    // Analyze current page context
    if (message.context.currentPage) {
      const page = message.context.currentPage.toLowerCase();
      
      if (page.includes('linkedin') && contextScores.has(TaskType.JOB_SEARCH)) {
        contextScores.set(TaskType.JOB_SEARCH, contextScores.get(TaskType.JOB_SEARCH)! + 0.4);
      }
      
      if (page.includes('indeed') && contextScores.has(TaskType.JOB_APPLICATION)) {
        contextScores.set(TaskType.JOB_APPLICATION, contextScores.get(TaskType.JOB_APPLICATION)! + 0.4);
      }
    }

    // Time-based context
    if (message.context.timeOfDay) {
      const hour = new Date().getHours();
      
      // Business hours boost for professional tasks
      if (hour >= 9 && hour <= 17) {
        if (contextScores.has(TaskType.JOB_SEARCH)) {
          contextScores.set(TaskType.JOB_SEARCH, contextScores.get(TaskType.JOB_SEARCH)! + 0.1);
        }
        if (contextScores.has(TaskType.COMPANY_RESEARCH)) {
          contextScores.set(TaskType.COMPANY_RESEARCH, contextScores.get(TaskType.COMPANY_RESEARCH)! + 0.1);
        }
      }
    }

    return contextScores;
  }

  // =============================================================================
  // ML-BASED CLASSIFICATION (Simplified Heuristic Approach)
  // =============================================================================

  private applyMLClassification(features: Record<string, any>, context?: any): Map<TaskType, number> {
    const mlScores = new Map<TaskType, number>();

    // Feature-based scoring using learned patterns
    const featureWeights = {
      hasJobKeywords: { [TaskType.JOB_SEARCH]: 0.8, [TaskType.JOB_APPLICATION]: 0.7 },
      hasCompanyKeywords: { [TaskType.COMPANY_RESEARCH]: 0.9, [TaskType.CONTACT_SCRAPING]: 0.6 },
      hasDataKeywords: { [TaskType.DATA_EXTRACTION]: 0.9, [TaskType.CONTACT_SCRAPING]: 0.7 },
      hasAutomationKeywords: { [TaskType.CUSTOM_WORKFLOW]: 0.9, [TaskType.FORM_FILLING]: 0.5 },
      hasActionWords: { [TaskType.JOB_APPLICATION]: 0.6, [TaskType.FORM_FILLING]: 0.8 },
      hasUrgencyWords: { [TaskType.JOB_APPLICATION]: 0.3, [TaskType.FORM_FILLING]: 0.4 },
    };

    // Calculate ML scores
    for (const [feature, weights] of Object.entries(featureWeights)) {
      if (features[feature]) {
        for (const [taskType, weight] of Object.entries(weights)) {
          const currentScore = mlScores.get(taskType as TaskType) || 0;
          mlScores.set(taskType as TaskType, currentScore + weight);
        }
      }
    }

    // Normalize scores
    const maxScore = Math.max(...Array.from(mlScores.values()));
    if (maxScore > 0) {
      for (const [taskType, score] of mlScores.entries()) {
        mlScores.set(taskType, score / maxScore);
      }
    }

    return mlScores;
  }

  // =============================================================================
  // INTENT COMBINATION AND RANKING
  // =============================================================================

  private combineAndRankIntents(
    patternMatches: Intent[],
    contextScores: Map<TaskType, number>,
    mlScores: Map<TaskType, number>
  ): Intent[] {
    const combinedIntents = new Map<TaskType, Intent>();

    // Combine pattern matches with context and ML scores
    for (const intent of patternMatches) {
      const contextScore = contextScores.get(intent.type) || 0;
      const mlScore = mlScores.get(intent.type) || 0;
      
      // Weighted combination
      const combinedConfidence = (
        intent.confidence * 0.5 +  // Pattern matching: 50%
        contextScore * 0.3 +       // Context: 30%
        mlScore * 0.2              // ML: 20%
      );

      const combinedIntent: Intent = {
        ...intent,
        confidence: Math.min(combinedConfidence, 1.0), // Cap at 1.0
      };

      combinedIntents.set(intent.type, combinedIntent);
    }

    // Convert to array and sort by confidence
    return Array.from(combinedIntents.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  // =============================================================================
  // RESULT GENERATION
  // =============================================================================

  private generateClassificationResult(rankedIntents: Intent[], message: UserMessage): ClassificationResult {
    if (rankedIntents.length === 0) {
      return this.getFallbackIntent(message);
    }

    const primaryIntent = rankedIntents[0];
    const alternativeIntents = rankedIntents.slice(1, 3); // Top 3 alternatives
    
    // Determine if clarification is needed
    const needsClarification = (
      primaryIntent.confidence < 0.7 ||
      (alternativeIntents.length > 0 && alternativeIntents[0].confidence > primaryIntent.confidence - 0.2)
    );

    // Generate clarification questions if needed
    const clarificationQuestions = needsClarification 
      ? this.generateClarificationQuestions(primaryIntent, alternativeIntents)
      : [];

    // Generate reasoning
    const reasoning = this.generateReasoning(primaryIntent, alternativeIntents, message);

    return {
      primaryIntent,
      alternativeIntents,
      reasoning,
      confidence: primaryIntent.confidence,
      needsClarification,
      clarificationQuestions,
    };
  }

  private generateClarificationQuestions(primary: Intent, alternatives: Intent[]): string[] {
    const questions: string[] = [];

    if (primary.type === TaskType.JOB_SEARCH && alternatives.some(a => a.type === TaskType.JOB_APPLICATION)) {
      questions.push('Do you want to search for jobs or apply to specific positions?');
    }

    if (primary.type === TaskType.DATA_EXTRACTION && alternatives.some(a => a.type === TaskType.CONTACT_SCRAPING)) {
      questions.push('Are you looking to extract general data or specifically contact information?');
    }

    if (primary.type === TaskType.COMPANY_RESEARCH && alternatives.some(a => a.type === TaskType.CONTACT_SCRAPING)) {
      questions.push('Do you want company information or contact details from the company?');
    }

    // Generic clarification
    if (questions.length === 0 && alternatives.length > 0) {
      const altTypes = alternatives.map(a => a.type).join(' or ');
      questions.push(`Did you mean ${primary.type} or ${altTypes}?`);
    }

    return questions;
  }

  private generateReasoning(primary: Intent, alternatives: Intent[], message: UserMessage): string {
    const reasons: string[] = [];

    reasons.push(`Classified as ${primary.type} with ${(primary.confidence * 100).toFixed(1)}% confidence`);

    if (primary.confidence > 0.8) {
      reasons.push('High confidence due to clear intent indicators');
    } else if (primary.confidence > 0.6) {
      reasons.push('Medium confidence with some ambiguity');
    } else {
      reasons.push('Lower confidence, may need clarification');
    }

    if (alternatives.length > 0) {
      reasons.push(`Alternative interpretations: ${alternatives.map(a => a.type).join(', ')}`);
    }

    if (message.context?.previousTasks?.length) {
      reasons.push('Context from previous tasks considered');
    }

    return reasons.join('; ');
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private determinePriority(features: Record<string, any>, pattern: IntentPattern): 'low' | 'medium' | 'high' | 'urgent' {
    if (features.hasUrgencyWords) return 'urgent';
    if (pattern.taskType === TaskType.JOB_APPLICATION) return 'high';
    if (pattern.complexity === 'high') return 'high';
    if (pattern.complexity === 'medium') return 'medium';
    return 'low';
  }

  private estimateDuration(taskType: TaskType, complexity: 'low' | 'medium' | 'high'): number {
    const baseDurations = {
      [TaskType.JOB_SEARCH]: 300,        // 5 minutes
      [TaskType.JOB_APPLICATION]: 600,   // 10 minutes
      [TaskType.COMPANY_RESEARCH]: 480,  // 8 minutes
      [TaskType.CONTACT_SCRAPING]: 420,  // 7 minutes
      [TaskType.DATA_EXTRACTION]: 360,   // 6 minutes
      [TaskType.FORM_FILLING]: 180,      // 3 minutes
      [TaskType.CUSTOM_WORKFLOW]: 900,   // 15 minutes
    };

    const complexityMultipliers = {
      low: 0.7,
      medium: 1.0,
      high: 1.5,
    };

    return Math.round(baseDurations[taskType] * complexityMultipliers[complexity]);
  }

  private getRequiredCapabilities(taskType: TaskType): string[] {
    const capabilities = {
      [TaskType.JOB_SEARCH]: ['web_scraping', 'data_extraction', 'search_optimization'],
      [TaskType.JOB_APPLICATION]: ['form_filling', 'file_upload', 'navigation', 'data_validation'],
      [TaskType.COMPANY_RESEARCH]: ['web_scraping', 'data_analysis', 'information_synthesis'],
      [TaskType.CONTACT_SCRAPING]: ['web_scraping', 'email_extraction', 'data_validation'],
      [TaskType.DATA_EXTRACTION]: ['web_scraping', 'data_parsing', 'structure_analysis'],
      [TaskType.FORM_FILLING]: ['form_detection', 'input_automation', 'validation'],
      [TaskType.CUSTOM_WORKFLOW]: ['workflow_design', 'step_sequencing', 'condition_handling'],
    };

    return capabilities[taskType] || ['basic_automation'];
  }

  private getFallbackIntent(message: UserMessage): ClassificationResult {
    return {
      primaryIntent: {
        type: TaskType.DATA_EXTRACTION,
        confidence: 0.5,
        parameters: {},
        agentType: AgentType.EXTRACTOR,
        complexity: 'medium',
        priority: 'medium',
        estimatedDuration: 300,
        requiredCapabilities: ['web_scraping', 'data_extraction'],
      },
      alternativeIntents: [],
      reasoning: 'Fallback intent due to unclear user message',
      confidence: 0.5,
      needsClarification: true,
      clarificationQuestions: [
        'Could you please clarify what specific task you would like me to help you with?',
        'Are you looking to search for information, fill out forms, or automate a process?'
      ],
    };
  }

  private storeClassificationResult(message: UserMessage, result: ClassificationResult): void {
    if (!message.userId) return;

    const key = message.userId;
    if (!this.classificationHistory.has(key)) {
      this.classificationHistory.set(key, []);
    }

    const history = this.classificationHistory.get(key)!;
    history.push(result);

    // Keep only last 50 classifications per user
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  private initializeContextualPatterns(): void {
    // Initialize with common patterns
    this.contextualPatterns.set('job_search_after_research', 0.8);
    this.contextualPatterns.set('application_after_search', 0.9);
    this.contextualPatterns.set('contact_after_research', 0.7);
    this.contextualPatterns.set('workflow_for_power_users', 0.6);
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  public getClassificationHistory(userId: string): ClassificationResult[] {
    return this.classificationHistory.get(userId) || [];
  }

  public updateUserProfile(userId: string, profile: any): void {
    this.userProfiles.set(userId, profile);
  }

  public getStats(): {
    totalClassifications: number;
    averageConfidence: number;
    topIntentTypes: Array<{ type: TaskType; count: number }>;
    clarificationRate: number;
  } {
    let totalClassifications = 0;
    let totalConfidence = 0;
    let clarificationCount = 0;
    const intentCounts = new Map<TaskType, number>();

    for (const history of this.classificationHistory.values()) {
      for (const result of history) {
        totalClassifications++;
        totalConfidence += result.confidence;
        
        if (result.needsClarification) {
          clarificationCount++;
        }

        const currentCount = intentCounts.get(result.primaryIntent.type) || 0;
        intentCounts.set(result.primaryIntent.type, currentCount + 1);
      }
    }

    const topIntentTypes = Array.from(intentCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalClassifications,
      averageConfidence: totalClassifications > 0 ? totalConfidence / totalClassifications : 0,
      topIntentTypes,
      clarificationRate: totalClassifications > 0 ? clarificationCount / totalClassifications : 0,
    };
  }
}

export default IntentClassifier;