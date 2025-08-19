import { logger } from '@/utils/logger';

// Simple in-memory database for development
export class SimpleDatabaseService {
  private static instance: SimpleDatabaseService;
  private data: Map<string, any> = new Map();

  private constructor() {}

  public static getInstance(): SimpleDatabaseService {
    if (!SimpleDatabaseService.instance) {
      SimpleDatabaseService.instance = new SimpleDatabaseService();
    }
    return SimpleDatabaseService.instance;
  }

  public async connect(): Promise<void> {
    logger.info('Simple database connected (in-memory)');
    this.initializeData();
  }

  public async disconnect(): Promise<void> {
    logger.info('Simple database disconnected');
    this.data.clear();
  }

  private initializeData(): void {
    // Initialize with sample data
    this.data.set('users', [
      {
        id: '1',
        email: 'demo@example.com',
        name: 'Demo User',
        passwordHash: '$2a$10$example', // bcrypt hash for 'password'
        createdAt: new Date(),
      }
    ]);

    this.data.set('conversations', []);
    this.data.set('workflows', []);
    this.data.set('executions', []);
  }

  public async findUser(email: string): Promise<any> {
    const users = this.data.get('users') || [];
    return users.find((user: any) => user.email === email);
  }

  public async createUser(userData: any): Promise<any> {
    const users = this.data.get('users') || [];
    const newUser = {
      id: Date.now().toString(),
      ...userData,
      createdAt: new Date(),
    };
    users.push(newUser);
    this.data.set('users', users);
    return newUser;
  }

  public async findUserById(id: string): Promise<any> {
    const users = this.data.get('users') || [];
    return users.find((user: any) => user.id === id);
  }

  public async createConversation(userId: string, title?: string): Promise<any> {
    const conversations = this.data.get('conversations') || [];
    const newConversation = {
      id: Date.now().toString(),
      userId,
      title: title || 'New Conversation',
      messages: [],
      createdAt: new Date(),
    };
    conversations.push(newConversation);
    this.data.set('conversations', conversations);
    return newConversation;
  }

  public async getUserConversations(userId: string): Promise<any[]> {
    const conversations = this.data.get('conversations') || [];
    return conversations.filter((conv: any) => conv.userId === userId);
  }

  public async addMessage(conversationId: string, message: any): Promise<any> {
    const conversations = this.data.get('conversations') || [];
    const conversation = conversations.find((conv: any) => conv.id === conversationId);
    
    if (conversation) {
      const newMessage = {
        id: Date.now().toString(),
        ...message,
        createdAt: new Date(),
      };
      conversation.messages.push(newMessage);
      this.data.set('conversations', conversations);
      return newMessage;
    }
    
    throw new Error('Conversation not found');
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }
}

export default SimpleDatabaseService;