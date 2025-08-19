/**
 * Simple Background Script for Browser AI Agent Extension
 * Minimal version that connects to the backend API
 */
interface SimpleSession {
    id: string;
    userId?: string;
    token: string;
    createdAt: Date;
    lastActivity: Date;
}
interface SimpleMessage {
    id: string;
    content: string;
    type: 'user' | 'assistant';
    timestamp: Date;
}
declare class SimpleBrowserAIAgent {
    private apiBaseUrl;
    private currentSession;
    constructor();
    private setupMessageHandlers;
    private handleMessage;
    private createSession;
    private sendChatMessage;
    private executeAutomation;
    private getPageContext;
    private handleTabUpdate;
}
