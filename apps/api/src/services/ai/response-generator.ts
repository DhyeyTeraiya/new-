import { logger } from '../../utils/logger';
import { TaskType, AgentType } from '../../../../../packages/shared/src/types/agent';
import { ConversationContext, ContextMessage } from './context-manager';
import { Intent } from './intent-classifier';

// =============================================================================
// ADVANCED RESPONSE GENERATION SERVICE
// Superior Response Quality with Personality Adaptation and Task Optimization
// =============================================================================

export interface ResponseGenerationRequest {
  intent: Intent;
  context: ConversationContext;
  userMessage: string;
  agentType?: AgentType;
  responseStyle?: ResponseStyle;
  constraints?: ResponseConstraints;
}

export interface ResponseStyle {
  tone: 'professional' | 'friendly' | 'casual' | 'technical' | 'empathetic';
  length: 'brief' | 'moderate' | 'detailed' | 'comprehensive';
  format: 'text' | 'structured' | 'step_by_step' | 'bullet_points';
  personality: 'helpful' | 'expert' | 'collaborative' | 'efficient';
  adaptToUser: boolean;
}

export interface ResponseConstraints {
  maxLength?: number;
  includeActions?: boolean;
  includeExamples?: boolean;
  includeClarifications?: boolean;
  avoidTechnicalJargon?: boolean;
  prioritizeSpeed?: boolean;
}

export interface GeneratedResponse {
  content: string;
  metadata: {
    responseType: string;
    confidence: number;
    processingTime: number;
    tokensUsed: number;
    personalityScore: number;
    adaptationLevel: number;
  };
  suggestedActions?: Action[];
  followUpQuestions?: string[];
  clarifications?: string[];
}

export interface Action {
  id: string;
  type: 'button' | 'link' | 'form' | 'command';
  label: string;
  description?: string;
  parameters?: Record<string, any>;
  priority: 'high' | 'medium' | 'low';
}

// =============================================================================
// RESPONSE TEMPLATES AND PATTERNS
// =============================================================================

interface ResponseTemplate {
  pattern: string;
  variables: string[];
  tone: ResponseStyle['tone'];
  agentType: AgentType;
  taskType: TaskType;
  examples: string[];
}

const RESPONSE_TEMPLATES: ResponseTemplate[] = [
  {
    pattern: "I'll help you {action} {target}. Let me {approach} and {outcome}.",
    variables: ['action', 'target', 'approach', 'outcome'],
    tone: 'professional',
    agentType: AgentType.PLANNER,
    taskType: TaskType.JOB_SEARCH,
    examples: [
      "I'll help you find relevant job opportunities. Let me search across multiple platforms and provide you with a curated list of positions that match your criteria."
    ]
  },
  {
    pattern: "Great! I can {capability} for you. This will involve {steps} and should take approximately {duration}.",
    variables: ['capability', 'steps', 'duration'],
    tone: 'friendly',
    agentType: AgentType.NAVIGATOR,
    taskType: TaskType.JOB_APPLICATION,
    examples: [
      "Great! I can automate the job application process for you. This will involve filling out forms, uploading your resume, and submitting applications, and should take approximately 10-15 minutes per application."
    ]
  }
];

// =============================================================================
// ADVANCED RESPONSE GENERATOR
// =============================================================================

export class ResponseGenerator {
  private static instance: ResponseGenerator;
  private responseHistory: Map<string, GeneratedResponse[]> = new Map();
  private personalityProfiles: Map<string, PersonalityProfile> = new Map();
  private adaptationRules: Map<string, AdaptationRule[]> = new Map();

  private constructor() {
    this.initializePersonalityProfiles();
    this.initializeAdaptationRules();
  }

  public static getInstance(): ResponseGenerator {
    if (!ResponseGenerator.instance) {
      ResponseGenerator.instance = new ResponseGenerator();
    }
    return ResponseGenerator.instance;
  }  
// =============================================================================
  // MAIN RESPONSE GENERATION METHOD
  // =============================================================================

  public async generateResponse(request: ResponseGenerationRequest): Promise<GeneratedResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Generating response', {
        intent: request.intent.type,
        agentType: request.agentType,
        userMessageLength: request.userMessage.length,
      });

      // Determine response style
      const responseStyle = await this.determineResponseStyle(request);
      
      // Generate base response content
      const baseContent = await this.generateBaseContent(request, responseStyle);
      
      // Apply personality adaptation
      const adaptedContent = await this.applyPersonalityAdaptation(
        baseContent, 
        request.context, 
        responseStyle
      );
      
      // Generate suggested actions
      const suggestedActions = await this.generateSuggestedActions(request);
      
      // Generate follow-up questions
      const followUpQuestions = await this.generateFollowUpQuestions(request);
      
      // Generate clarifications if needed
      const clarifications = request.intent.confidence < 0.7 
        ? await this.generateClarifications(request)
        : [];

      const processingTime = Date.now() - startTime;
      
      const response: GeneratedResponse = {
        content: adaptedContent,
        metadata: {
          responseType: this.getResponseType(request.intent),
          confidence: request.intent.confidence,
          processingTime,
          tokensUsed: this.estimateTokens(adaptedContent),
          personalityScore: this.calculatePersonalityScore(adaptedContent, responseStyle),
          adaptationLevel: this.calculateAdaptationLevel(request.context),
        },
        suggestedActions,
        followUpQuestions,
        clarifications,
      };

      // Store response for learning
      this.storeResponse(request.context.sessionId, response);
      
      logger.info('Response generated successfully', {
        responseLength: response.content.length,
        processingTime,
        confidence: response.metadata.confidence,
        actionsCount: suggestedActions.length,
      });

      return response;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Response generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        intent: request.intent.type,
      });

      // Return fallback response
      return this.generateFallbackResponse(request, processingTime);
    }
  }

  // =============================================================================
  // RESPONSE STYLE DETERMINATION
  // =============================================================================

  private async determineResponseStyle(request: ResponseGenerationRequest): Promise<ResponseStyle> {
    // Start with default style
    let style: ResponseStyle = {
      tone: 'professional',
      length: 'moderate',
      format: 'text',
      personality: 'helpful',
      adaptToUser: true,
    };

    // Override with provided style
    if (request.responseStyle) {
      style = { ...style, ...request.responseStyle };
    }

    // Adapt based on user profile
    if (request.context.userProfile && style.adaptToUser) {
      const profile = request.context.userProfile;
      
      style.tone = this.mapCommunicationStyle(profile.preferences.communicationStyle);
      style.length = this.mapResponseLength(profile.preferences.responseLength);
      
      if (profile.preferences.expertise === 'expert') {
        style.tone = 'technical';
        style.format = 'structured';
      } else if (profile.preferences.expertise === 'beginner') {
        style.tone = 'friendly';
        style.format = 'step_by_step';
      }
    }

    // Adapt based on intent and agent type
    if (request.intent.priority === 'urgent') {
      style.length = 'brief';
      style.personality = 'efficient';
    }

    if (request.agentType === AgentType.NAVIGATOR) {
      style.format = 'step_by_step';
      style.tone = 'friendly';
    } else if (request.agentType === AgentType.PLANNER) {
      style.format = 'structured';
      style.tone = 'professional';
    }

    return style;
  }

  private mapCommunicationStyle(style: string): ResponseStyle['tone'] {
    const mapping = {
      formal: 'professional' as const,
      casual: 'friendly' as const,
      technical: 'technical' as const,
    };
    return mapping[style] || 'professional';
  }

  private mapResponseLength(length: string): ResponseStyle['length'] {
    const mapping = {
      brief: 'brief' as const,
      detailed: 'detailed' as const,
      comprehensive: 'comprehensive' as const,
    };
    return mapping[length] || 'moderate';
  }

  // =============================================================================
  // CONTENT GENERATION
  // =============================================================================

  private async generateBaseContent(
    request: ResponseGenerationRequest, 
    style: ResponseStyle
  ): Promise<string> {
    const { intent, userMessage, agentType } = request;
    
    // Find matching template
    const template = this.findBestTemplate(intent, agentType || AgentType.PLANNER);
    
    if (template) {
      return this.fillTemplate(template, request, style);
    }

    // Generate content based on intent type
    switch (intent.type) {
      case TaskType.JOB_SEARCH:
        return this.generateJobSearchResponse(request, style);
      case TaskType.JOB_APPLICATION:
        return this.generateJobApplicationResponse(request, style);
      case TaskType.COMPANY_RESEARCH:
        return this.generateCompanyResearchResponse(request, style);
      case TaskType.CONTACT_SCRAPING:
        return this.generateContactScrapingResponse(request, style);
      case TaskType.DATA_EXTRACTION:
        return this.generateDataExtractionResponse(request, style);
      case TaskType.FORM_FILLING:
        return this.generateFormFillingResponse(request, style);
      case TaskType.CUSTOM_WORKFLOW:
        return this.generateCustomWorkflowResponse(request, style);
      default:
        return this.generateGenericResponse(request, style);
    }
  }

  private generateJobSearchResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    const { intent, userMessage } = request;
    
    const responses = {
      brief: "I'll search for relevant job opportunities based on your criteria and provide you with a curated list of positions.",
      moderate: "I'll help you find job opportunities that match your skills and preferences. I'll search across multiple job platforms including LinkedIn, Indeed, and Glassdoor to find the best matches for you.",
      detailed: "I'll conduct a comprehensive job search for you across multiple platforms. This will include analyzing job descriptions, filtering based on your criteria, and providing detailed information about each opportunity including company details, salary ranges, and application requirements.",
      comprehensive: "I'll perform an extensive job search tailored to your specific requirements. This comprehensive search will cover major job platforms, analyze market trends, identify emerging opportunities, and provide detailed insights about each position including company culture, growth potential, and competitive analysis."
    };

    let baseResponse = responses[style.length] || responses.moderate;

    // Add specific parameters if available
    if (intent.parameters.platforms) {
      baseResponse += ` I'll focus on platforms like ${intent.parameters.platforms.join(', ')}.`;
    }

    if (intent.estimatedDuration) {
      baseResponse += ` This should take approximately ${Math.round(intent.estimatedDuration / 60)} minutes to complete.`;
    }

    return baseResponse;
  }

  private generateJobApplicationResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    const responses = {
      brief: "I'll automate the job application process for you, filling out forms and submitting applications.",
      moderate: "I'll help you apply to jobs by automatically filling out application forms, uploading your resume, and submitting applications on your behalf. I'll ensure all information is accurate and complete.",
      detailed: "I'll streamline your job application process by automating form completion, document uploads, and submission procedures. I'll customize each application based on the specific job requirements and track the status of all submissions.",
      comprehensive: "I'll provide end-to-end job application automation, including intelligent form filling, personalized cover letter generation, resume optimization for each position, application tracking, and follow-up scheduling. Each application will be tailored to maximize your chances of success."
    };

    return responses[style.length] || responses.moderate;
  }

  private generateCompanyResearchResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    const responses = {
      brief: "I'll research the company and provide you with key information about their business, culture, and opportunities.",
      moderate: "I'll conduct comprehensive company research including business overview, recent news, company culture, employee reviews, and growth prospects to help you make informed decisions.",
      detailed: "I'll perform in-depth company analysis covering business model, financial performance, market position, leadership team, company culture, employee satisfaction, recent developments, and strategic initiatives.",
      comprehensive: "I'll deliver a complete company intelligence report including competitive analysis, market positioning, financial health assessment, leadership evaluation, cultural analysis, employee sentiment, growth trajectory, and strategic recommendations."
    };

    return responses[style.length] || responses.moderate;
  }

  private generateContactScrapingResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    const responses = {
      brief: "I'll extract contact information from the specified sources and provide you with a structured list.",
      moderate: "I'll help you gather contact information including email addresses, phone numbers, and social media profiles from your target sources while ensuring compliance with privacy regulations.",
      detailed: "I'll systematically extract and verify contact information from multiple sources, organize the data in a structured format, and ensure all information is current and accurate while maintaining ethical data collection practices.",
      comprehensive: "I'll conduct comprehensive contact research and extraction, including multi-source verification, data enrichment, contact scoring based on relevance, and delivery in your preferred format with full compliance documentation."
    };

    return responses[style.length] || responses.moderate;
  }

  private generateDataExtractionResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    const responses = {
      brief: "I'll extract the requested data from the specified sources and organize it for you.",
      moderate: "I'll help you extract structured data from websites or documents, clean and organize the information, and deliver it in your preferred format.",
      detailed: "I'll perform systematic data extraction using advanced scraping techniques, validate data quality, handle different formats and structures, and provide clean, organized datasets ready for analysis.",
      comprehensive: "I'll execute comprehensive data extraction with intelligent parsing, multi-source aggregation, data quality assessment, format standardization, and delivery with detailed metadata and extraction reports."
    };

    return responses[style.length] || responses.moderate;
  }

  private generateFormFillingResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    const responses = {
      brief: "I'll automatically fill out the forms using your provided information.",
      moderate: "I'll help you complete forms by automatically filling in your information, validating inputs, and ensuring all required fields are properly completed.",
      detailed: "I'll automate the form completion process with intelligent field detection, data validation, error handling, and submission confirmation while maintaining accuracy and completeness.",
      comprehensive: "I'll provide complete form automation including intelligent field mapping, multi-format support, validation rules application, error recovery, progress tracking, and submission verification with detailed completion reports."
    };

    return responses[style.length] || responses.moderate;
  }

  private generateCustomWorkflowResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    const responses = {
      brief: "I'll create a custom automation workflow based on your specific requirements.",
      moderate: "I'll help you design and implement a custom workflow that automates your specific process, including all necessary steps and decision points.",
      detailed: "I'll develop a comprehensive automation workflow tailored to your needs, including step sequencing, condition handling, error recovery, and integration with your existing systems.",
      comprehensive: "I'll architect and implement a sophisticated automation workflow with advanced logic, multi-path execution, intelligent decision making, comprehensive error handling, monitoring capabilities, and optimization for maximum efficiency."
    };

    return responses[style.length] || responses.moderate;
  }

  private generateGenericResponse(request: ResponseGenerationRequest, style: ResponseStyle): string {
    return "I'll help you accomplish this task efficiently. Let me analyze your requirements and provide you with the best possible solution.";
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private findBestTemplate(intent: Intent, agentType: AgentType): ResponseTemplate | null {
    return RESPONSE_TEMPLATES.find(template => 
      template.taskType === intent.type && template.agentType === agentType
    ) || null;
  }

  private fillTemplate(template: ResponseTemplate, request: ResponseGenerationRequest, style: ResponseStyle): string {
    // Simple template filling (in production, use more sophisticated templating)
    let content = template.pattern;
    
    const variables = {
      action: this.getActionForTask(request.intent.type),
      target: this.getTargetForTask(request.intent.type),
      approach: this.getApproachForTask(request.intent.type),
      outcome: this.getOutcomeForTask(request.intent.type),
      capability: this.getCapabilityForTask(request.intent.type),
      steps: this.getStepsForTask(request.intent.type),
      duration: `${Math.round(request.intent.estimatedDuration / 60)} minutes`,
    };

    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(`{${key}}`, value);
    }

    return content;
  }

  private getActionForTask(taskType: TaskType): string {
    const actions = {
      [TaskType.JOB_SEARCH]: 'find',
      [TaskType.JOB_APPLICATION]: 'apply to',
      [TaskType.COMPANY_RESEARCH]: 'research',
      [TaskType.CONTACT_SCRAPING]: 'extract contacts from',
      [TaskType.DATA_EXTRACTION]: 'extract data from',
      [TaskType.FORM_FILLING]: 'fill out',
      [TaskType.CUSTOM_WORKFLOW]: 'automate',
    };
    return actions[taskType] || 'help with';
  }

  private getTargetForTask(taskType: TaskType): string {
    const targets = {
      [TaskType.JOB_SEARCH]: 'relevant job opportunities',
      [TaskType.JOB_APPLICATION]: 'job positions',
      [TaskType.COMPANY_RESEARCH]: 'company information',
      [TaskType.CONTACT_SCRAPING]: 'contact information',
      [TaskType.DATA_EXTRACTION]: 'structured data',
      [TaskType.FORM_FILLING]: 'forms and applications',
      [TaskType.CUSTOM_WORKFLOW]: 'your process',
    };
    return targets[taskType] || 'your request';
  }

  private getApproachForTask(taskType: TaskType): string {
    const approaches = {
      [TaskType.JOB_SEARCH]: 'search across multiple platforms',
      [TaskType.JOB_APPLICATION]: 'automate the application process',
      [TaskType.COMPANY_RESEARCH]: 'gather comprehensive information',
      [TaskType.CONTACT_SCRAPING]: 'systematically extract contacts',
      [TaskType.DATA_EXTRACTION]: 'parse and structure the data',
      [TaskType.FORM_FILLING]: 'automatically complete all fields',
      [TaskType.CUSTOM_WORKFLOW]: 'design a custom automation',
    };
    return approaches[taskType] || 'work on this systematically';
  }

  private getOutcomeForTask(taskType: TaskType): string {
    const outcomes = {
      [TaskType.JOB_SEARCH]: 'provide you with a curated list of matching positions',
      [TaskType.JOB_APPLICATION]: 'submit applications on your behalf',
      [TaskType.COMPANY_RESEARCH]: 'deliver detailed company insights',
      [TaskType.CONTACT_SCRAPING]: 'provide organized contact data',
      [TaskType.DATA_EXTRACTION]: 'deliver clean, structured datasets',
      [TaskType.FORM_FILLING]: 'ensure accurate form completion',
      [TaskType.CUSTOM_WORKFLOW]: 'create an efficient automated process',
    };
    return outcomes[taskType] || 'achieve your desired outcome';
  }

  private getCapabilityForTask(taskType: TaskType): string {
    const capabilities = {
      [TaskType.JOB_SEARCH]: 'search for jobs',
      [TaskType.JOB_APPLICATION]: 'automate job applications',
      [TaskType.COMPANY_RESEARCH]: 'research companies',
      [TaskType.CONTACT_SCRAPING]: 'extract contact information',
      [TaskType.DATA_EXTRACTION]: 'extract and organize data',
      [TaskType.FORM_FILLING]: 'fill out forms automatically',
      [TaskType.CUSTOM_WORKFLOW]: 'create custom workflows',
    };
    return capabilities[taskType] || 'help you';
  }

  private getStepsForTask(taskType: TaskType): string {
    const steps = {
      [TaskType.JOB_SEARCH]: 'searching multiple platforms and filtering results',
      [TaskType.JOB_APPLICATION]: 'form filling, document upload, and submission',
      [TaskType.COMPANY_RESEARCH]: 'data gathering, analysis, and report generation',
      [TaskType.CONTACT_SCRAPING]: 'systematic extraction and data validation',
      [TaskType.DATA_EXTRACTION]: 'parsing, cleaning, and structuring data',
      [TaskType.FORM_FILLING]: 'field detection, data input, and validation',
      [TaskType.CUSTOM_WORKFLOW]: 'workflow design, testing, and implementation',
    };
    return steps[taskType] || 'systematic processing';
  }

  private async applyPersonalityAdaptation(
    content: string, 
    context: ConversationContext, 
    style: ResponseStyle
  ): Promise<string> {
    // Apply tone adjustments
    switch (style.tone) {
      case 'friendly':
        content = this.makeFriendly(content);
        break;
      case 'professional':
        content = this.makeProfessional(content);
        break;
      case 'technical':
        content = this.makeTechnical(content);
        break;
      case 'empathetic':
        content = this.makeEmpathetic(content);
        break;
    }

    // Apply format adjustments
    switch (style.format) {
      case 'step_by_step':
        content = this.formatAsSteps(content);
        break;
      case 'bullet_points':
        content = this.formatAsBullets(content);
        break;
      case 'structured':
        content = this.formatAsStructured(content);
        break;
    }

    return content;
  }

  private makeFriendly(content: string): string {
    // Add friendly language patterns
    const friendlyPhrases = [
      "I'd be happy to help you",
      "Let's get this done together",
      "This sounds like a great opportunity",
      "I'm excited to help you with this"
    ];
    
    // Simple friendly adaptation
    if (!content.includes("I'd") && !content.includes("Let's")) {
      content = friendlyPhrases[0] + " " + content.toLowerCase();
    }
    
    return content;
  }

  private makeProfessional(content: string): string {
    // Ensure professional tone
    return content.replace(/I'd/g, "I will")
                 .replace(/Let's/g, "I will")
                 .replace(/great/gi, "excellent")
                 .replace(/awesome/gi, "outstanding");
  }

  private makeTechnical(content: string): string {
    // Add technical precision
    return content.replace(/help you/g, "execute")
                 .replace(/find/g, "identify and retrieve")
                 .replace(/get/g, "obtain");
  }

  private makeEmpathetic(content: string): string {
    // Add empathetic language
    const empathetic = "I understand this is important to you. " + content;
    return empathetic;
  }

  private formatAsSteps(content: string): string {
    // Convert to step format
    const sentences = content.split('. ');
    return sentences.map((sentence, index) => 
      `${index + 1}. ${sentence}${sentence.endsWith('.') ? '' : '.'}`
    ).join('\n');
  }

  private formatAsBullets(content: string): string {
    // Convert to bullet points
    const sentences = content.split('. ');
    return sentences.map(sentence => 
      `• ${sentence}${sentence.endsWith('.') ? '' : '.'}`
    ).join('\n');
  }

  private formatAsStructured(content: string): string {
    // Add structure with headers
    return `**Overview:**\n${content}\n\n**Next Steps:**\nI'll begin processing your request immediately.`;
  }

  private async generateSuggestedActions(request: ResponseGenerationRequest): Promise<Action[]> {
    const actions: Action[] = [];
    const { intent } = request;

    // Common actions based on intent type
    switch (intent.type) {
      case TaskType.JOB_SEARCH:
        actions.push({
          id: 'start_job_search',
          type: 'button',
          label: 'Start Job Search',
          description: 'Begin searching for job opportunities',
          priority: 'high',
        });
        break;
      
      case TaskType.JOB_APPLICATION:
        actions.push({
          id: 'start_applications',
          type: 'button',
          label: 'Start Applications',
          description: 'Begin automated job applications',
          priority: 'high',
        });
        break;
    }

    // Add common actions
    actions.push({
      id: 'modify_request',
      type: 'button',
      label: 'Modify Request',
      description: 'Change or refine your requirements',
      priority: 'medium',
    });

    return actions;
  }

  private async generateFollowUpQuestions(request: ResponseGenerationRequest): Promise<string[]> {
    const questions: string[] = [];
    const { intent } = request;

    // Generate relevant follow-up questions
    switch (intent.type) {
      case TaskType.JOB_SEARCH:
        questions.push(
          "What specific job titles or roles are you most interested in?",
          "Do you have any preferred companies or industries?",
          "What's your preferred salary range?"
        );
        break;
      
      case TaskType.COMPANY_RESEARCH:
        questions.push(
          "Are there specific aspects of the company you're most interested in?",
          "Do you need information for a particular purpose (interview, investment, etc.)?"
        );
        break;
    }

    return questions.slice(0, 2); // Limit to 2 questions
  }

  private async generateClarifications(request: ResponseGenerationRequest): Promise<string[]> {
    const clarifications: string[] = [];
    
    if (request.intent.confidence < 0.7) {
      clarifications.push("I want to make sure I understand your request correctly.");
      
      if (request.intent.confidence < 0.5) {
        clarifications.push("Could you provide more details about what you're looking for?");
      }
    }

    return clarifications;
  }

  private getResponseType(intent: Intent): string {
    return `${intent.type}_response`;
  }

  private estimateTokens(content: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(content.length / 4);
  }

  private calculatePersonalityScore(content: string, style: ResponseStyle): number {
    // Simple personality scoring based on style adherence
    let score = 0.5;
    
    if (style.tone === 'friendly' && (content.includes("I'd") || content.includes("happy"))) {
      score += 0.2;
    }
    
    if (style.tone === 'professional' && content.includes("will")) {
      score += 0.2;
    }
    
    if (style.format === 'step_by_step' && content.includes('\n')) {
      score += 0.1;
    }
    
    return Math.min(1.0, score);
  }

  private calculateAdaptationLevel(context: ConversationContext): number {
    // Calculate how well adapted the response is to the user
    let adaptationLevel = 0.5;
    
    if (context.userProfile) {
      adaptationLevel += 0.2;
      
      // Bonus for message history
      if (context.messages.length > 5) {
        adaptationLevel += 0.1;
      }
      
      // Bonus for knowledge graph entities
      if (context.knowledgeGraph && context.knowledgeGraph.entities.size > 0) {
        adaptationLevel += 0.1;
      }
    }
    
    return Math.min(1.0, adaptationLevel);
  }

  private storeResponse(sessionId: string, response: GeneratedResponse): void {
    if (!this.responseHistory.has(sessionId)) {
      this.responseHistory.set(sessionId, []);
    }
    
    const history = this.responseHistory.get(sessionId)!;
    history.push(response);
    
    // Keep only last 50 responses per session
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  private generateFallbackResponse(request: ResponseGenerationRequest, processingTime: number): GeneratedResponse {
    return {
      content: "I understand you need help with this task. Let me assist you in the best way I can. Could you provide a bit more detail about what you're looking for?",
      metadata: {
        responseType: 'fallback',
        confidence: 0.3,
        processingTime,
        tokensUsed: 25,
        personalityScore: 0.5,
        adaptationLevel: 0.3,
      },
      suggestedActions: [{
        id: 'clarify_request',
        type: 'button',
        label: 'Clarify Request',
        description: 'Provide more details about your needs',
        priority: 'high',
      }],
      followUpQuestions: [
        'What specific task would you like me to help you with?',
        'Could you provide more details about your requirements?'
      ],
      clarifications: [
        'I want to make sure I understand your request correctly.',
        'Please provide more information so I can assist you better.'
      ],
    };
  }

  // =============================================================================
  // PERSONALITY AND ADAPTATION INITIALIZATION
  // =============================================================================

  private initializePersonalityProfiles(): void {
    // Initialize personality profiles for different user types
    this.personalityProfiles.set('beginner', {
      communicationStyle: 'friendly',
      explanationLevel: 'detailed',
      technicalDepth: 'minimal',
      encouragement: 'high',
      patience: 'high',
    });

    this.personalityProfiles.set('intermediate', {
      communicationStyle: 'professional',
      explanationLevel: 'moderate',
      technicalDepth: 'moderate',
      encouragement: 'medium',
      patience: 'medium',
    });

    this.personalityProfiles.set('expert', {
      communicationStyle: 'technical',
      explanationLevel: 'brief',
      technicalDepth: 'high',
      encouragement: 'low',
      patience: 'low',
    });
  }

  private initializeAdaptationRules(): void {
    // Initialize adaptation rules for different scenarios
    this.adaptationRules.set('first_interaction', [
      {
        condition: 'no_user_profile',
        action: 'use_friendly_tone',
        weight: 0.8,
      },
      {
        condition: 'unclear_intent',
        action: 'ask_clarifying_questions',
        weight: 0.9,
      },
    ]);

    this.adaptationRules.set('repeat_user', [
      {
        condition: 'has_preferences',
        action: 'apply_user_preferences',
        weight: 1.0,
      },
      {
        condition: 'previous_success',
        action: 'use_similar_approach',
        weight: 0.7,
      },
    ]);
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  public getResponseHistory(sessionId: string): GeneratedResponse[] {
    return this.responseHistory.get(sessionId) || [];
  }

  public getStats(): {
    totalResponses: number;
    averageConfidence: number;
    averageProcessingTime: number;
    topResponseTypes: Array<{ type: string; count: number }>;
  } {
    let totalResponses = 0;
    let totalConfidence = 0;
    let totalProcessingTime = 0;
    const responseTypeCounts = new Map<string, number>();

    for (const history of this.responseHistory.values()) {
      for (const response of history) {
        totalResponses++;
        totalConfidence += response.metadata.confidence;
        totalProcessingTime += response.metadata.processingTime;

        const currentCount = responseTypeCounts.get(response.metadata.responseType) || 0;
        responseTypeCounts.set(response.metadata.responseType, currentCount + 1);
      }
    }

    const topResponseTypes = Array.from(responseTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalResponses,
      averageConfidence: totalResponses > 0 ? totalConfidence / totalResponses : 0,
      averageProcessingTime: totalResponses > 0 ? totalProcessingTime / totalResponses : 0,
      topResponseTypes,
    };
  }



  public shutdown(): void {
    this.responseHistory.clear();
    this.personalityProfiles.clear();
    this.adaptationRules.clear();
    logger.info('Response generator shutdown');
  }
}

// =============================================================================
// SUPPORTING INTERFACES
// =============================================================================

interface PersonalityProfile {
  communicationStyle: 'friendly' | 'professional' | 'technical';
  explanationLevel: 'brief' | 'moderate' | 'detailed';
  technicalDepth: 'minimal' | 'moderate' | 'high';
  encouragement: 'low' | 'medium' | 'high';
  patience: 'low' | 'medium' | 'high';
}

interface AdaptationRule {
  condition: string;
  action: string;
  weight: number;
}

export default ResponseGenerator;