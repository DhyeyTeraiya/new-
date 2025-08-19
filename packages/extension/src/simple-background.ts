/**
 * Simple Background Script for Browser AI Agent Extension
 * Minimal version that connects to the backend API
 */

// Simple types for our extension
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

class SimpleBrowserAIAgent {
  private apiBaseUrl = 'http://localhost:3000/api/v1';
  private currentSession: SimpleSession | null = null;

  constructor() {
    this.setupMessageHandlers();
    console.log('🤖 Browser AI Agent Extension - Background Script Loaded');
  }

  private setupMessageHandlers(): void {
    // Listen for messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      console.log('🚀 Browser AI Agent Extension Installed');
      this.createSession();
    });

    // Handle tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tabId, tab);
      }
    });
  }

  private async handleMessage(message: any, sender: any, sendResponse: (response: any) => void): Promise<void> {
    try {
      switch (message.type) {
        case 'GET_SESSION':
          sendResponse({ 
            success: true, 
            session: this.currentSession 
          });
          break;

        case 'SEND_CHAT_MESSAGE':
          const chatResponse = await this.sendChatMessage(message.content);
          sendResponse({ 
            success: true, 
            response: chatResponse 
          });
          break;

        case 'EXECUTE_AUTOMATION':
          const automationResponse = await this.executeAutomation(message.actions);
          sendResponse({ 
            success: true, 
            response: automationResponse 
          });
          break;

        case 'GET_PAGE_CONTEXT':
          const pageContext = await this.getPageContext(sender.tab?.id);
          sendResponse({ 
            success: true, 
            context: pageContext 
          });
          break;

        default:
          sendResponse({ 
            success: false, 
            error: 'Unknown message type' 
          });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private async createSession(): Promise<void> {
    try {
      const deviceInfo = {
        type: 'desktop' as const,
        browser: 'chrome',
        browserVersion: '120.0.0',
        os: 'Windows',
        osVersion: '11',
        screenResolution: '1920x1080',
        userAgent: navigator.userAgent
      };

      const response = await fetch(`${this.apiBaseUrl}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceInfo,
          preferences: {
            theme: 'light',
            language: 'en'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        this.currentSession = {
          id: data.data.session.id,
          userId: data.data.session.userId,
          token: data.data.token,
          createdAt: new Date(data.data.session.createdAt),
          lastActivity: new Date(data.data.session.lastActivity)
        };

        console.log('✅ Session created:', this.currentSession.id);
        
        // Store session in chrome storage
        await chrome.storage.local.set({
          currentSession: this.currentSession
        });
      } else {
        throw new Error(data.error?.message || 'Failed to create session');
      }

    } catch (error) {
      console.error('❌ Failed to create session:', error);
      
      // Create a fallback local session
      this.currentSession = {
        id: `local_${Date.now()}`,
        token: `token_${Date.now()}`,
        createdAt: new Date(),
        lastActivity: new Date()
      };
    }
  }

  private async sendChatMessage(content: string): Promise<SimpleMessage> {
    try {
      if (!this.currentSession) {
        await this.createSession();
      }

      const response = await fetch(`${this.apiBaseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession?.token}`
        },
        body: JSON.stringify({
          message: content,
          sessionId: this.currentSession?.id
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return {
          id: data.data.response.id,
          content: data.data.response.content,
          type: 'assistant',
          timestamp: new Date(data.data.response.timestamp)
        };
      } else {
        throw new Error(data.error?.message || 'Failed to send chat message');
      }

    } catch (error) {
      console.error('❌ Failed to send chat message:', error);
      
      // Return a fallback response
      return {
        id: `msg_${Date.now()}`,
        content: `I'm sorry, I'm having trouble connecting to the AI service. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'assistant',
        timestamp: new Date()
      };
    }
  }

  private async executeAutomation(actions: any[]): Promise<any> {
    try {
      if (!this.currentSession) {
        await this.createSession();
      }

      const response = await fetch(`${this.apiBaseUrl}/automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession?.token}`
        },
        body: JSON.stringify({
          actions,
          sessionId: this.currentSession?.id
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.error?.message || 'Failed to execute automation');
      }

    } catch (error) {
      console.error('❌ Failed to execute automation:', error);
      
      return {
        results: [],
        finalState: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getPageContext(tabId?: number): Promise<any> {
    if (!tabId) {
      return { error: 'No tab ID provided' };
    }

    try {
      // Get basic tab information
      const tab = await chrome.tabs.get(tabId);
      
      return {
        url: tab.url,
        title: tab.title,
        timestamp: new Date(),
        elements: [], // Would be populated by content script
        metadata: {
          favIconUrl: tab.favIconUrl,
          status: tab.status
        }
      };

    } catch (error) {
      console.error('❌ Failed to get page context:', error);
      return { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async handleTabUpdate(tabId: number, tab: chrome.tabs.Tab): Promise<void> {
    try {
      // Update session activity
      if (this.currentSession) {
        this.currentSession.lastActivity = new Date();
        await chrome.storage.local.set({
          currentSession: this.currentSession
        });
      }

      console.log('📄 Tab updated:', tab.url);

    } catch (error) {
      console.error('❌ Failed to handle tab update:', error);
    }
  }
}

// Initialize the background script
new SimpleBrowserAIAgent();