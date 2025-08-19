/**
 * Message Storage
 * Handles persistent storage of chat conversations and settings
 */

import { ChatConversation, ChatSettings } from './types';

export class MessageStorage {
  private readonly STORAGE_KEYS = {
    CONVERSATIONS: 'chat_conversations',
    SETTINGS: 'chat_settings',
    CURRENT_CONVERSATION: 'current_conversation_id'
  };

  private readonly MAX_CONVERSATIONS = 100;
  private readonly MAX_MESSAGES_PER_CONVERSATION = 1000;

  /**
   * Initialize storage
   */
  async initialize(): Promise<void> {
    // Perform any necessary migrations
    await this.performMigrations();
  }

  /**
   * Save conversation
   */
  async saveConversation(conversation: ChatConversation): Promise<void> {
    try {
      const conversations = await this.getConversations();
      const existingIndex = conversations.findIndex(c => c.id === conversation.id);

      // Limit messages per conversation
      if (conversation.messages.length > this.MAX_MESSAGES_PER_CONVERSATION) {
        conversation.messages = conversation.messages.slice(-this.MAX_MESSAGES_PER_CONVERSATION);
      }

      if (existingIndex >= 0) {
        conversations[existingIndex] = conversation;
      } else {
        conversations.unshift(conversation);
      }

      // Limit total conversations
      if (conversations.length > this.MAX_CONVERSATIONS) {
        conversations.splice(this.MAX_CONVERSATIONS);
      }

      await this.setStorageData(this.STORAGE_KEYS.CONVERSATIONS, conversations);
    } catch (error) {
      console.error('Failed to save conversation:', error);
      throw error;
    }
  }

  /**
   * Get all conversations
   */
  async getConversations(): Promise<ChatConversation[]> {
    try {
      const data = await this.getStorageData(this.STORAGE_KEYS.CONVERSATIONS);
      if (!data) return [];

      // Parse dates
      return data.map((conv: any) => ({
        ...conv,
        createdAt: new Date(conv.createdAt),
        updatedAt: new Date(conv.updatedAt),
        messages: conv.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
    } catch (error) {
      console.error('Failed to get conversations:', error);
      return [];
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(id: string): Promise<ChatConversation | null> {
    const conversations = await this.getConversations();
    return conversations.find(c => c.id === id) || null;
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string): Promise<void> {
    try {
      const conversations = await this.getConversations();
      const filteredConversations = conversations.filter(c => c.id !== id);
      await this.setStorageData(this.STORAGE_KEYS.CONVERSATIONS, filteredConversations);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  }

  /**
   * Save settings
   */
  async saveSettings(settings: ChatSettings): Promise<void> {
    try {
      await this.setStorageData(this.STORAGE_KEYS.SETTINGS, settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Get settings
   */
  async getSettings(): Promise<ChatSettings | null> {
    try {
      return await this.getStorageData(this.STORAGE_KEYS.SETTINGS);
    } catch (error) {
      console.error('Failed to get settings:', error);
      return null;
    }
  }

  /**
   * Save current conversation ID
   */
  async saveCurrentConversationId(id: string): Promise<void> {
    try {
      await this.setStorageData(this.STORAGE_KEYS.CURRENT_CONVERSATION, id);
    } catch (error) {
      console.error('Failed to save current conversation ID:', error);
    }
  }

  /**
   * Get current conversation ID
   */
  async getCurrentConversationId(): Promise<string | null> {
    try {
      return await this.getStorageData(this.STORAGE_KEYS.CURRENT_CONVERSATION);
    } catch (error) {
      console.error('Failed to get current conversation ID:', error);
      return null;
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(query: string): Promise<ChatConversation[]> {
    const conversations = await this.getConversations();
    const searchTerm = query.toLowerCase();

    return conversations.filter(conversation => {
      // Search in title
      if (conversation.title.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Search in messages
      return conversation.messages.some(message => 
        message.content.toLowerCase().includes(searchTerm)
      );
    });
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalConversations: number;
    totalMessages: number;
    storageUsed: number;
    oldestConversation?: Date;
    newestConversation?: Date;
  }> {
    const conversations = await this.getConversations();
    const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
    
    // Estimate storage usage (rough calculation)
    const storageUsed = JSON.stringify(conversations).length;

    const dates = conversations.map(c => c.createdAt).sort((a, b) => a.getTime() - b.getTime());

    return {
      totalConversations: conversations.length,
      totalMessages,
      storageUsed,
      oldestConversation: dates[0],
      newestConversation: dates[dates.length - 1]
    };
  }

  /**
   * Export all data
   */
  async exportData(): Promise<{
    conversations: ChatConversation[];
    settings: ChatSettings | null;
    exportDate: Date;
    version: string;
  }> {
    const conversations = await this.getConversations();
    const settings = await this.getSettings();

    return {
      conversations,
      settings,
      exportDate: new Date(),
      version: '1.0.0'
    };
  }

  /**
   * Import data
   */
  async importData(data: {
    conversations: ChatConversation[];
    settings?: ChatSettings;
  }): Promise<void> {
    try {
      // Validate data structure
      if (!Array.isArray(data.conversations)) {
        throw new Error('Invalid conversations data');
      }

      // Import conversations
      for (const conversation of data.conversations) {
        await this.saveConversation(conversation);
      }

      // Import settings if provided
      if (data.settings) {
        await this.saveSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  /**
   * Clear all data
   */
  async clearAllData(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        this.STORAGE_KEYS.CONVERSATIONS,
        this.STORAGE_KEYS.SETTINGS,
        this.STORAGE_KEYS.CURRENT_CONVERSATION
      ]);
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }

  /**
   * Cleanup old conversations
   */
  async cleanupOldConversations(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const conversations = await this.getConversations();
      const cutoffDate = new Date(Date.now() - maxAge);
      
      const activeConversations = conversations.filter(conv => 
        conv.updatedAt > cutoffDate || !conv.archived
      );

      const removedCount = conversations.length - activeConversations.length;
      
      if (removedCount > 0) {
        await this.setStorageData(this.STORAGE_KEYS.CONVERSATIONS, activeConversations);
      }

      return removedCount;
    } catch (error) {
      console.error('Failed to cleanup old conversations:', error);
      return 0;
    }
  }

  /**
   * Backup data to file
   */
  async backupToFile(): Promise<Blob> {
    const data = await this.exportData();
    const jsonString = JSON.stringify(data, null, 2);
    return new Blob([jsonString], { type: 'application/json' });
  }

  /**
   * Restore data from file
   */
  async restoreFromFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const jsonString = event.target?.result as string;
          const data = JSON.parse(jsonString);
          
          // Validate backup format
          if (!data.conversations || !Array.isArray(data.conversations)) {
            throw new Error('Invalid backup file format');
          }

          await this.importData(data);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read backup file'));
      reader.readAsText(file);
    });
  }

  /**
   * Private helper methods
   */

  private async getStorageData(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result[key]);
        }
      });
    });
  }

  private async setStorageData(key: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: data }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  private async performMigrations(): Promise<void> {
    try {
      // Check if migration is needed
      const version = await this.getStorageData('storage_version');
      
      if (!version) {
        // First time setup
        await this.setStorageData('storage_version', '1.0.0');
        return;
      }

      // Future migrations would go here
      // if (version < '1.1.0') {
      //   await this.migrateToV1_1_0();
      // }

    } catch (error) {
      console.error('Migration failed:', error);
    }
  }

  /**
   * Get storage quota information
   */
  async getStorageQuota(): Promise<{
    used: number;
    available: number;
    percentage: number;
  }> {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
        const quota = chrome.storage.local.QUOTA_BYTES;
        const available = quota - bytesInUse;
        const percentage = (bytesInUse / quota) * 100;

        resolve({
          used: bytesInUse,
          available,
          percentage
        });
      });
    });
  }

  /**
   * Optimize storage by compressing old conversations
   */
  async optimizeStorage(): Promise<{
    beforeSize: number;
    afterSize: number;
    saved: number;
  }> {
    const beforeStats = await this.getStorageStats();
    const conversations = await this.getConversations();

    // Compress old conversations (older than 7 days)
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const optimizedConversations = conversations.map(conversation => {
      if (conversation.updatedAt < cutoffDate) {
        // Keep only essential message data for old conversations
        return {
          ...conversation,
          messages: conversation.messages.map(message => ({
            id: message.id,
            type: message.type,
            content: message.content.length > 500 ? 
              message.content.substring(0, 500) + '...' : 
              message.content,
            timestamp: message.timestamp,
            // Remove metadata for old messages to save space
            metadata: undefined
          }))
        };
      }
      return conversation;
    });

    await this.setStorageData(this.STORAGE_KEYS.CONVERSATIONS, optimizedConversations);
    
    const afterStats = await this.getStorageStats();
    
    return {
      beforeSize: beforeStats.storageUsed,
      afterSize: afterStats.storageUsed,
      saved: beforeStats.storageUsed - afterStats.storageUsed
    };
  }
}