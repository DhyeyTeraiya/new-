/**
 * Chrome extension storage utilities
 */

export interface StorageData {
  [key: string]: any;
}

export class ExtensionStorage {
  /**
   * Get data from chrome.storage.local
   */
  static async get<T = any>(keys: string | string[]): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result as T);
        }
      });
    });
  }

  /**
   * Set data in chrome.storage.local
   */
  static async set(data: StorageData): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Remove data from chrome.storage.local
   */
  static async remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Clear all data from chrome.storage.local
   */
  static async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get storage usage information
   */
  static async getBytesInUse(keys?: string | string[]): Promise<number> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.getBytesInUse(keys, (bytesInUse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(bytesInUse);
        }
      });
    });
  }

  /**
   * Listen for storage changes
   */
  static onChanged(
    callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
  ): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        callback(changes);
      }
    });
  }
}

/**
 * Typed storage helpers for specific data types
 */
export class TypedStorage {
  /**
   * Session storage helpers
   */
  static async getSessionId(): Promise<string | null> {
    const result = await ExtensionStorage.get('browser_ai_session_id');
    return result.browser_ai_session_id || null;
  }

  static async setSessionId(sessionId: string): Promise<void> {
    await ExtensionStorage.set({ browser_ai_session_id: sessionId });
  }

  static async removeSessionId(): Promise<void> {
    await ExtensionStorage.remove('browser_ai_session_id');
  }

  /**
   * Auth token storage helpers
   */
  static async getAuthToken(): Promise<string | null> {
    const result = await ExtensionStorage.get('browser_ai_auth_token');
    return result.browser_ai_auth_token || null;
  }

  static async setAuthToken(token: string): Promise<void> {
    await ExtensionStorage.set({ browser_ai_auth_token: token });
  }

  static async removeAuthToken(): Promise<void> {
    await ExtensionStorage.remove('browser_ai_auth_token');
  }

  /**
   * User preferences storage helpers
   */
  static async getUserPreferences(): Promise<any | null> {
    const result = await ExtensionStorage.get('browser_ai_preferences');
    return result.browser_ai_preferences || null;
  }

  static async setUserPreferences(preferences: any): Promise<void> {
    await ExtensionStorage.set({ browser_ai_preferences: preferences });
  }

  static async removeUserPreferences(): Promise<void> {
    await ExtensionStorage.remove('browser_ai_preferences');
  }

  /**
   * Connection state storage helpers
   */
  static async getConnectionState(): Promise<'connected' | 'disconnected' | 'connecting' | null> {
    const result = await ExtensionStorage.get('browser_ai_connection_state');
    return result.browser_ai_connection_state || null;
  }

  static async setConnectionState(state: 'connected' | 'disconnected' | 'connecting'): Promise<void> {
    await ExtensionStorage.set({ browser_ai_connection_state: state });
  }

  /**
   * Widget state storage helpers
   */
  static async getWidgetState(): Promise<{
    visible: boolean;
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null> {
    const result = await ExtensionStorage.get('browser_ai_widget_state');
    return result.browser_ai_widget_state || null;
  }

  static async setWidgetState(state: {
    visible: boolean;
    position: { x: number; y: number };
    size: { width: number; height: number };
  }): Promise<void> {
    await ExtensionStorage.set({ browser_ai_widget_state: state });
  }

  /**
   * Conversation history cache helpers
   */
  static async getCachedConversation(sessionId: string): Promise<any[] | null> {
    const result = await ExtensionStorage.get(`conversation_cache_${sessionId}`);
    return result[`conversation_cache_${sessionId}`] || null;
  }

  static async setCachedConversation(sessionId: string, messages: any[]): Promise<void> {
    // Limit cache size to last 50 messages
    const limitedMessages = messages.slice(-50);
    await ExtensionStorage.set({ [`conversation_cache_${sessionId}`]: limitedMessages });
  }

  static async removeCachedConversation(sessionId: string): Promise<void> {
    await ExtensionStorage.remove(`conversation_cache_${sessionId}`);
  }

  /**
   * Page context cache helpers
   */
  static async getCachedPageContext(url: string): Promise<any | null> {
    const cacheKey = `page_context_${btoa(url).replace(/[^a-zA-Z0-9]/g, '')}`;
    const result = await ExtensionStorage.get(cacheKey);
    return result[cacheKey] || null;
  }

  static async setCachedPageContext(url: string, context: any): Promise<void> {
    const cacheKey = `page_context_${btoa(url).replace(/[^a-zA-Z0-9]/g, '')}`;
    // Add timestamp for cache expiration
    const cachedContext = {
      ...context,
      cachedAt: Date.now(),
    };
    await ExtensionStorage.set({ [cacheKey]: cachedContext });
  }

  static async clearPageContextCache(): Promise<void> {
    // Get all storage keys
    const allData = await ExtensionStorage.get(null);
    const pageContextKeys = Object.keys(allData).filter(key => key.startsWith('page_context_'));
    
    if (pageContextKeys.length > 0) {
      await ExtensionStorage.remove(pageContextKeys);
    }
  }

  /**
   * Settings helpers
   */
  static async getSettings(): Promise<{
    apiBaseUrl: string;
    wsUrl: string;
    enableNotifications: boolean;
    enableAutoScreenshots: boolean;
    widgetPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    theme: 'light' | 'dark' | 'auto';
  }> {
    const result = await ExtensionStorage.get('browser_ai_settings');
    return result.browser_ai_settings || {
      apiBaseUrl: 'http://localhost:3000/api/v1',
      wsUrl: 'ws://localhost:3000',
      enableNotifications: true,
      enableAutoScreenshots: true,
      widgetPosition: 'bottom-right',
      theme: 'auto',
    };
  }

  static async setSettings(settings: {
    apiBaseUrl?: string;
    wsUrl?: string;
    enableNotifications?: boolean;
    enableAutoScreenshots?: boolean;
    widgetPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    theme?: 'light' | 'dark' | 'auto';
  }): Promise<void> {
    const currentSettings = await this.getSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    await ExtensionStorage.set({ browser_ai_settings: updatedSettings });
  }

  /**
   * Clear all extension data
   */
  static async clearAllData(): Promise<void> {
    await ExtensionStorage.clear();
  }

  /**
   * Get storage usage statistics
   */
  static async getStorageStats(): Promise<{
    totalBytes: number;
    sessionBytes: number;
    cacheBytes: number;
    settingsBytes: number;
  }> {
    const totalBytes = await ExtensionStorage.getBytesInUse();
    
    const sessionKeys = ['browser_ai_session_id', 'browser_ai_auth_token', 'browser_ai_preferences'];
    const sessionBytes = await ExtensionStorage.getBytesInUse(sessionKeys);
    
    const allData = await ExtensionStorage.get(null);
    const cacheKeys = Object.keys(allData).filter(key => 
      key.startsWith('conversation_cache_') || key.startsWith('page_context_')
    );
    const cacheBytes = cacheKeys.length > 0 ? await ExtensionStorage.getBytesInUse(cacheKeys) : 0;
    
    const settingsBytes = await ExtensionStorage.getBytesInUse('browser_ai_settings');

    return {
      totalBytes,
      sessionBytes,
      cacheBytes,
      settingsBytes,
    };
  }

  /**
   * Clean up old cached data
   */
  static async cleanupCache(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const allData = await ExtensionStorage.get(null);
    const now = Date.now();
    const keysToRemove: string[] = [];

    // Check page context cache
    Object.keys(allData).forEach(key => {
      if (key.startsWith('page_context_')) {
        const data = allData[key];
        if (data.cachedAt && (now - data.cachedAt) > maxAgeMs) {
          keysToRemove.push(key);
        }
      }
    });

    if (keysToRemove.length > 0) {
      await ExtensionStorage.remove(keysToRemove);
    }

    return keysToRemove.length;
  }
}