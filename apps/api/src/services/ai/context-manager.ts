import { logger } from '../../utils/logger';
import { TaskType, AgentType } from '../../../../../packages/shared/src/types/agent';

// =============================================================================
// ADVANCED CONTEXT MANAGEMENT SERVICE
// Superior Context Handling with Vector Embeddings and Knowledge Graphs
// =============================================================================

export interface ConversationContext {
  sessionId: string;
  userId?: string;
  messages: ContextMessage[];
  currentTask?: TaskContext;
  userProfile?: UserProfile;
  environmentContext?: EnvironmentContext;
  knowledgeGraph?: KnowledgeGraph;
  metadata: {
    startTime: Date;
    lastActivity: Date;
    messageCount: number;
    totalTokens: number;
    averageResponseTime: number;
  };
}

export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    intent?: string;
    confidence?: number;
    tokens?: number;
    processingTime?: number;
    agentType?: AgentType;
  };
  embeddings?: number[];
  relevanceScore?: number;
}

export interface TaskContext {
  taskId: string;
  type: TaskType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  parameters: Record<string, any>;
  progress: {
    currentStep: string;
    percentage: number;
    estimatedTimeLeft?: number;
  };
  results?: any;
  error?: string;
}

export interface UserProfile {
  userId: string;
  preferences: {
    communicationStyle: 'formal' | 'casual' | 'technical';
    responseLength: 'brief' | 'detailed' | 'comprehensive';
    expertise: 'beginner' | 'intermediate' | 'expert';
    preferredAgents: AgentType[];
  };
  history: {
    totalTasks: number;
    successfulTasks: number;
    preferredTaskTypes: TaskType[];
    averageSessionLength: number;
    lastActiveDate: Date;
  };
  personalInfo?: {
    name?: string;
    jobTitle?: string;
    industry?: string;
    skills?: string[];
    goals?: string[];
  };
}

export interface EnvironmentContext {
  currentUrl?: string;
  pageTitle?: string;
  pageContent?: string;
  browserInfo?: {
    userAgent: string;
    viewport: { width: number; height: number };
    language: string;
    timezone: string;
  };
  deviceInfo?: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    screen: { width: number; height: number };
  };
  networkInfo?: {
    connectionType: string;
    effectiveType: string;
    downlink: number;
  };
}

export interface KnowledgeGraph {
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  concepts: Map<string, Concept>;
}

export interface Entity {
  id: string;
  type: 'person' | 'company' | 'job' | 'skill' | 'location' | 'website';
  name: string;
  properties: Record<string, any>;
  confidence: number;
  mentions: number;
  lastMentioned: Date;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  properties: Record<string, any>;
}

export interface Concept {
  id: string;
  name: string;
  category: string;
  importance: number;
  relatedConcepts: string[];
  embeddings?: number[];
}

export interface ContextRetrievalOptions {
  maxMessages?: number;
  timeWindow?: number; // seconds
  relevanceThreshold?: number;
  includeSystemMessages?: boolean;
  prioritizeRecent?: boolean;
  semanticSearch?: boolean;
}

// =============================================================================
// ADVANCED CONTEXT MANAGER
// =============================================================================

export class ContextManager {
  private static instance: ContextManager;
  private contexts: Map<string, ConversationContext> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private globalKnowledge: KnowledgeGraph = {
    entities: new Map(),
    relationships: new Map(),
    concepts: new Map(),
  };
  private contextCleanupInterval?: NodeJS.Timeout;

  private constructor() {
    this.startContextCleanup();
    this.initializeGlobalKnowledge();
  }

  public static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  // =============================================================================
  // CONTEXT MANAGEMENT
  // =============================================================================

  public async createContext(sessionId: string, userId?: string): Promise<ConversationContext> {
    logger.info('Creating new conversation context', { sessionId, userId });

    const context: ConversationContext = {
      sessionId,
      userId,
      messages: [],
      userProfile: userId ? await this.getUserProfile(userId) : undefined,
      knowledgeGraph: {
        entities: new Map(),
        relationships: new Map(),
        concepts: new Map(),
      },
      metadata: {
        startTime: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        totalTokens: 0,
        averageResponseTime: 0,
      },
    };

    this.contexts.set(sessionId, context);
    return context;
  }

  public async getContext(sessionId: string): Promise<ConversationContext | null> {
    return this.contexts.get(sessionId) || null;
  }

  public async updateContext(sessionId: string, updates: Partial<ConversationContext>): Promise<void> {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new Error(`Context not found for session: ${sessionId}`);
    }

    Object.assign(context, updates);
    context.metadata.lastActivity = new Date();
    
    logger.debug('Context updated', { sessionId, updates: Object.keys(updates) });
  }

  public async addMessage(
    sessionId: string,
    message: Omit<ContextMessage, 'id' | 'timestamp'>
  ): Promise<void> {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new Error(`Context not found for session: ${sessionId}`);
    }

    const contextMessage: ContextMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date(),
    };

    // Generate embeddings for semantic search
    if (message.content && message.role !== 'system') {
      contextMessage.embeddings = await this.generateEmbeddings(message.content);
    }

    // Extract entities and update knowledge graph
    if (message.role === 'user') {
      await this.extractAndUpdateEntities(message.content, context);
    }

    context.messages.push(contextMessage);
    context.metadata.messageCount++;
    context.metadata.lastActivity = new Date();

    // Update token count
    if (message.metadata?.tokens) {
      context.metadata.totalTokens += message.metadata.tokens;
    }

    // Maintain context window size
    await this.maintainContextWindow(context);

    logger.debug('Message added to context', {
      sessionId,
      messageId: contextMessage.id,
      role: message.role,
      contentLength: message.content.length,
    });
  }

  // =============================================================================
  // CONTEXT RETRIEVAL AND FILTERING
  // =============================================================================

  public async getRelevantContext(
    sessionId: string,
    query?: string,
    options: ContextRetrievalOptions = {}
  ): Promise<ContextMessage[]> {
    const context = this.contexts.get(sessionId);
    if (!context) {
      return [];
    }

    const {
      maxMessages = 20,
      timeWindow = 3600, // 1 hour
      relevanceThreshold = 0.7,
      includeSystemMessages = false,
      prioritizeRecent = true,
      semanticSearch = true,
    } = options;

    let messages = [...context.messages];

    // Filter by time window
    const cutoffTime = new Date(Date.now() - timeWindow * 1000);
    messages = messages.filter(msg => msg.timestamp >= cutoffTime);

    // Filter system messages if not requested
    if (!includeSystemMessages) {
      messages = messages.filter(msg => msg.role !== 'system');
    }

    // Semantic search if query provided
    if (query && semanticSearch) {
      const queryEmbeddings = await this.generateEmbeddings(query);
      
      for (const message of messages) {
        if (message.embeddings) {
          message.relevanceScore = this.calculateSimilarity(queryEmbeddings, message.embeddings);
        }
      }

      // Filter by relevance threshold
      messages = messages.filter(msg => 
        !msg.relevanceScore || msg.relevanceScore >= relevanceThreshold
      );
    }

    // Sort by relevance and recency
    messages.sort((a, b) => {
      if (prioritizeRecent) {
        const timeScore = b.timestamp.getTime() - a.timestamp.getTime();
        const relevanceScore = (b.relevanceScore || 0) - (a.relevanceScore || 0);
        return relevanceScore * 0.7 + timeScore * 0.3;
      } else {
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      }
    });

    // Limit to max messages
    return messages.slice(0, maxMessages);
  }

  public async getContextSummary(sessionId: string): Promise<string> {
    const context = this.contexts.get(sessionId);
    if (!context || context.messages.length === 0) {
      return 'No conversation history available.';
    }

    const recentMessages = context.messages.slice(-10);
    const userMessages = recentMessages.filter(msg => msg.role === 'user');
    const assistantMessages = recentMessages.filter(msg => msg.role === 'assistant');

    const summary = [
      `Session started: ${context.metadata.startTime.toISOString()}`,
      `Messages exchanged: ${context.metadata.messageCount}`,
      `Current task: ${context.currentTask?.type || 'None'}`,
    ];

    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      summary.push(`Last user request: ${lastUserMessage.content.substring(0, 100)}...`);
    }

    if (context.currentTask) {
      summary.push(`Task progress: ${context.currentTask.progress.percentage}%`);
      summary.push(`Current step: ${context.currentTask.progress.currentStep}`);
    }

    // Add knowledge graph insights
    const entities = Array.from(context.knowledgeGraph?.entities.values() || []);
    if (entities.length > 0) {
      const topEntities = entities
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 3)
        .map(e => e.name);
      summary.push(`Key topics: ${topEntities.join(', ')}`);
    }

    return summary.join('\n');
  }

  // =============================================================================
  // KNOWLEDGE GRAPH MANAGEMENT
  // =============================================================================

  private async extractAndUpdateEntities(content: string, context: ConversationContext): Promise<void> {
    try {
      // Simple entity extraction (in production, use NLP libraries)
      const entities = this.extractEntitiesFromText(content);
      
      for (const entity of entities) {
        await this.updateEntity(context, entity);
      }

      // Extract relationships
      const relationships = this.extractRelationships(content, entities);
      for (const relationship of relationships) {
        await this.updateRelationship(context, relationship);
      }

    } catch (error) {
      logger.error('Failed to extract entities', {
        error: error instanceof Error ? error.message : 'Unknown error',
        content: content.substring(0, 100),
      });
    }
  }

  private extractEntitiesFromText(content: string): Partial<Entity>[] {
    const entities: Partial<Entity>[] = [];
    const text = content.toLowerCase();

    // Company patterns
    const companyPatterns = [
      /\b([A-Z][a-z]+ (?:Inc|Corp|LLC|Ltd|Company|Technologies|Systems|Solutions))\b/g,
      /\b(Google|Microsoft|Apple|Amazon|Meta|Tesla|Netflix|Uber|Airbnb)\b/gi,
    ];

    for (const pattern of companyPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          entities.push({
            type: 'company',
            name: match.trim(),
            properties: { source: 'text_extraction' },
            confidence: 0.8,
          });
        }
      }
    }

    // Job title patterns
    const jobPatterns = [
      /\b(software engineer|data scientist|product manager|designer|developer|analyst)\b/gi,
      /\b(senior|junior|lead|principal|staff|director|manager|intern)\s+\w+/gi,
    ];

    for (const pattern of jobPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          entities.push({
            type: 'job',
            name: match.trim(),
            properties: { source: 'text_extraction' },
            confidence: 0.7,
          });
        }
      }
    }

    // Skill patterns
    const skillPatterns = [
      /\b(JavaScript|Python|Java|React|Node\.js|SQL|AWS|Docker|Kubernetes)\b/gi,
      /\b(machine learning|artificial intelligence|data analysis|web development)\b/gi,
    ];

    for (const pattern of skillPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          entities.push({
            type: 'skill',
            name: match.trim(),
            properties: { source: 'text_extraction' },
            confidence: 0.9,
          });
        }
      }
    }

    // Location patterns
    const locationPatterns = [
      /\b(San Francisco|New York|London|Berlin|Tokyo|Sydney|Toronto|Seattle)\b/gi,
      /\b([A-Z][a-z]+,\s*[A-Z]{2})\b/g, // City, State
    ];

    for (const pattern of locationPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          entities.push({
            type: 'location',
            name: match.trim(),
            properties: { source: 'text_extraction' },
            confidence: 0.8,
          });
        }
      }
    }

    return entities;
  }

  private extractRelationships(content: string, entities: Partial<Entity>[]): Partial<Relationship>[] {
    const relationships: Partial<Relationship>[] = [];
    
    // Simple relationship extraction based on proximity and patterns
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];
        
        if (entity1.name && entity2.name) {
          // Check if entities appear close to each other in text
          const index1 = content.toLowerCase().indexOf(entity1.name.toLowerCase());
          const index2 = content.toLowerCase().indexOf(entity2.name.toLowerCase());
          
          if (Math.abs(index1 - index2) < 100) { // Within 100 characters
            let relationshipType = 'related_to';
            
            // Determine specific relationship types
            if (entity1.type === 'person' && entity2.type === 'company') {
              relationshipType = 'works_at';
            } else if (entity1.type === 'job' && entity2.type === 'company') {
              relationshipType = 'position_at';
            } else if (entity1.type === 'skill' && entity2.type === 'job') {
              relationshipType = 'required_for';
            }
            
            relationships.push({
              source: entity1.name,
              target: entity2.name,
              type: relationshipType,
              strength: 0.7,
              properties: { source: 'proximity_extraction' },
            });
          }
        }
      }
    }
    
    return relationships;
  }

  private async updateEntity(context: ConversationContext, entityData: Partial<Entity>): Promise<void> {
    if (!entityData.name || !entityData.type) return;

    const entityId = `${entityData.type}:${entityData.name.toLowerCase()}`;
    const existingEntity = context.knowledgeGraph?.entities.get(entityId);

    if (existingEntity) {
      // Update existing entity
      existingEntity.mentions++;
      existingEntity.lastMentioned = new Date();
      existingEntity.confidence = Math.max(existingEntity.confidence, entityData.confidence || 0);
      
      // Merge properties
      if (entityData.properties) {
        Object.assign(existingEntity.properties, entityData.properties);
      }
    } else {
      // Create new entity
      const newEntity: Entity = {
        id: entityId,
        type: entityData.type as Entity['type'],
        name: entityData.name,
        properties: entityData.properties || {},
        confidence: entityData.confidence || 0.5,
        mentions: 1,
        lastMentioned: new Date(),
      };
      
      context.knowledgeGraph?.entities.set(entityId, newEntity);
    }

    // Also update global knowledge
    this.updateGlobalEntity(entityData);
  }

  private async updateRelationship(context: ConversationContext, relationshipData: Partial<Relationship>): Promise<void> {
    if (!relationshipData.source || !relationshipData.target || !relationshipData.type) return;

    const relationshipId = `${relationshipData.source}:${relationshipData.type}:${relationshipData.target}`;
    const existingRelationship = context.knowledgeGraph?.relationships.get(relationshipId);

    if (existingRelationship) {
      // Strengthen existing relationship
      existingRelationship.strength = Math.min(1.0, existingRelationship.strength + 0.1);
    } else {
      // Create new relationship
      const newRelationship: Relationship = {
        id: relationshipId,
        source: relationshipData.source,
        target: relationshipData.target,
        type: relationshipData.type,
        strength: relationshipData.strength || 0.5,
        properties: relationshipData.properties || {},
      };
      
      context.knowledgeGraph?.relationships.set(relationshipId, newRelationship);
    }
  }

  // =============================================================================
  // USER PROFILE MANAGEMENT
  // =============================================================================

  public async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    return this.userProfiles.get(userId);
  }

  public async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    const existingProfile = this.userProfiles.get(userId);
    
    if (existingProfile) {
      Object.assign(existingProfile, updates);
    } else {
      const newProfile: UserProfile = {
        userId,
        preferences: {
          communicationStyle: 'casual',
          responseLength: 'detailed',
          expertise: 'intermediate',
          preferredAgents: [],
        },
        history: {
          totalTasks: 0,
          successfulTasks: 0,
          preferredTaskTypes: [],
          averageSessionLength: 0,
          lastActiveDate: new Date(),
        },
        ...updates,
      };
      
      this.userProfiles.set(userId, newProfile);
    }

    logger.info('User profile updated', { userId, updates: Object.keys(updates) });
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private async generateEmbeddings(text: string): Promise<number[]> {
    // Simplified embedding generation (in production, use proper embedding models)
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0); // 384-dimensional embedding
    
    // Simple hash-based embedding
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = this.simpleHash(word);
      
      for (let j = 0; j < embedding.length; j++) {
        embedding[j] += Math.sin(hash + j) * 0.1;
      }
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;
    
    let dotProduct = 0;
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
    }
    
    return Math.max(0, dotProduct); // Cosine similarity (assuming normalized embeddings)
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async maintainContextWindow(context: ConversationContext): Promise<void> {
    const maxMessages = 100; // Keep last 100 messages
    
    if (context.messages.length > maxMessages) {
      const messagesToRemove = context.messages.length - maxMessages;
      context.messages.splice(0, messagesToRemove);
      
      logger.debug('Context window maintained', {
        sessionId: context.sessionId,
        removedMessages: messagesToRemove,
        remainingMessages: context.messages.length,
      });
    }
  }

  private startContextCleanup(): void {
    this.contextCleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      for (const [sessionId, context] of this.contexts.entries()) {
        const age = now - context.metadata.lastActivity.getTime();
        
        if (age > maxAge) {
          this.contexts.delete(sessionId);
          logger.info('Cleaned up expired context', { sessionId, age });
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  private initializeGlobalKnowledge(): void {
    // Initialize with common entities and concepts
    const commonCompanies = [
      'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Tesla', 'Netflix', 'Uber', 'Airbnb'
    ];
    
    for (const company of commonCompanies) {
      this.globalKnowledge.entities.set(`company:${company.toLowerCase()}`, {
        id: `company:${company.toLowerCase()}`,
        type: 'company',
        name: company,
        properties: { category: 'tech', wellKnown: true },
        confidence: 1.0,
        mentions: 0,
        lastMentioned: new Date(),
      });
    }
  }

  private updateGlobalEntity(entityData: Partial<Entity>): void {
    if (!entityData.name || !entityData.type) return;
    
    const entityId = `${entityData.type}:${entityData.name.toLowerCase()}`;
    const existingEntity = this.globalKnowledge.entities.get(entityId);
    
    if (existingEntity) {
      existingEntity.mentions++;
      existingEntity.lastMentioned = new Date();
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  public async getContextStats(): Promise<{
    activeContexts: number;
    totalMessages: number;
    averageSessionLength: number;
    topEntities: Array<{ name: string; mentions: number }>;
  }> {
    let totalMessages = 0;
    let totalSessionTime = 0;
    const entityMentions = new Map<string, number>();
    
    for (const context of this.contexts.values()) {
      totalMessages += context.metadata.messageCount;
      
      const sessionDuration = Date.now() - context.metadata.startTime.getTime();
      totalSessionTime += sessionDuration;
      
      // Aggregate entity mentions
      for (const entity of context.knowledgeGraph?.entities.values() || []) {
        const currentMentions = entityMentions.get(entity.name) || 0;
        entityMentions.set(entity.name, currentMentions + entity.mentions);
      }
    }
    
    const topEntities = Array.from(entityMentions.entries())
      .map(([name, mentions]) => ({ name, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 10);
    
    return {
      activeContexts: this.contexts.size,
      totalMessages,
      averageSessionLength: this.contexts.size > 0 ? totalSessionTime / this.contexts.size : 0,
      topEntities,
    };
  }

  public shutdown(): void {
    if (this.contextCleanupInterval) {
      clearInterval(this.contextCleanupInterval);
    }
    
    this.contexts.clear();
    logger.info('Context manager shutdown');
  }
}

export default ContextManager;