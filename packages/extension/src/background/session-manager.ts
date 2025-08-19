import { UserSession, DeviceInfo } from '@browser-ai-agent/shared';
import { APIClient } from '../utils/api-client';
import { TypedStorage } from '../utils/storage';

export interface BackgroundSessionManagerConfig {
  apiBaseUrl: string;
  sessionTimeout: number;
  autoExtendSession: boolean;
  extendThreshold: number; // Minutes before expiry to auto-extend
}

export class BackgroundSessionManager {
  private config: BackgroundSessionManagerConfig;
  private apiClient: APIClient;
  private currentSession: UserSession | null = null;
  private sessionTimer?: NodeJS.Timeout;

  constructor(config: BackgroundSessionManagerConfig) {
    this.config = config;
    this.apiClient = new APIClient({
      baseUrl: config.apiBaseUrl,
      timeout: 30000,
    });
  }

  /**
   * Initialize session manager
   */
  async initialize(): Promise<void> {
    try {
      // Load stored session data
      const [sessionId, authToken] = await Promise.all([
        TypedStorage.getSessionId(),
        TypedStorage.getAuthToken(),
      ]);

      if (sessionId && authToken) {
        this.apiClient.setAuthToken(authToken);
        await this.restoreSession(sessionId);
      } else {
        await this.createNewSession();
      }

      // Start session monitoring
      this.startSessionMonitoring();

    } catch (error) {
      console.error('Failed to initialize session manager:', error);
      // Fallback to creating new session
      await this.createNewSession();
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): UserSession | null {
    return this.currentSession;
  }

  /**
   * Create new session
   */
  async createNewSession(): Promise<UserSession> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      const preferences = await TypedStorage.getUserPreferences();

      const sessionData = await this.apiClient.createSession({
        deviceInfo,
        preferences,
      });

      this.currentSession = sessionData.session;
      
      // Store session data
      await Promise.all([
        TypedStorage.setSessionId(sessionData.session.id),
        TypedStorage.setAuthToken(sessionData.token),
        TypedStorage.setUserPreferences(sessionData.session.preferences),
      ]);

      console.log('New session created:', sessionData.session.id);
      return sessionData.session;

    } catch (error) {
      console.error('Failed to create new session:', error);
      throw error;
    }
  }

  /**
   * Restore existing session
   */
  async restoreSession(sessionId: string): Promise<UserSession | null> {
    try {
      const session = await this.apiClient.getSession(sessionId);
      this.currentSession = session;

      console.log('Session restored:', sessionId);
      return session;

    } catch (error) {
      console.error('Failed to restore session:', error);
      
      // Clear invalid session data
      await this.clearSessionData();
      
      // Create new session
      await this.createNewSession();
      return this.currentSession;
    }
  }

  /**
   * Update session
   */
  async updateSession(updates: Partial<UserSession>): Promise<UserSession | null> {
    if (!this.currentSession) {
      console.error('No current session to update');
      return null;
    }

    try {
      const updatedSession = await this.apiClient.updateSession(
        this.currentSession.id,
        updates
      );

      this.currentSession = updatedSession;

      // Update stored preferences if they changed
      if (updates.preferences) {
        await TypedStorage.setUserPreferences(updatedSession.preferences);
      }

      return updatedSession;

    } catch (error) {
      console.error('Failed to update session:', error);
      return null;
    }
  }

  /**
   * Extend session expiry
   */
  async extendSession(extendByMinutes: number = 60): Promise<boolean> {
    if (!this.currentSession) {
      return false;
    }

    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/sessions/${this.currentSession.id}/extend`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiClient.getAuthToken()}`,
          },
          body: JSON.stringify({ extendByMinutes }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to extend session: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success && result.data?.session) {
        this.currentSession = result.data.session;
        console.log('Session extended:', extendByMinutes, 'minutes');
        return true;
      }

      return false;

    } catch (error) {
      console.error('Failed to extend session:', error);
      return false;
    }
  }

  /**
   * Clear session data
   */
  async clearSessionData(): Promise<void> {
    this.currentSession = null;
    
    await Promise.all([
      TypedStorage.removeSessionId(),
      TypedStorage.removeAuthToken(),
      TypedStorage.removeUserPreferences(),
    ]);

    console.log('Session data cleared');
  }

  /**
   * Check if session is valid and not expired
   */
  isSessionValid(): boolean {
    if (!this.currentSession) {
      return false;
    }

    const now = new Date();
    return this.currentSession.expiresAt > now;
  }

  /**
   * Get time until session expires
   */
  getTimeUntilExpiry(): number {
    if (!this.currentSession) {
      return 0;
    }

    return Math.max(0, this.currentSession.expiresAt.getTime() - Date.now());
  }

  /**
   * Start session monitoring
   */
  private startSessionMonitoring(): void {
    // Check session status every minute
    this.sessionTimer = setInterval(async () => {
      await this.checkSessionStatus();
    }, 60000);
  }

  /**
   * Check session status and auto-extend if needed
   */
  private async checkSessionStatus(): Promise<void> {
    if (!this.isSessionValid()) {
      console.log('Session expired, creating new session');
      await this.createNewSession();
      return;
    }

    // Auto-extend session if close to expiry
    if (this.config.autoExtendSession) {
      const timeUntilExpiry = this.getTimeUntilExpiry();
      const extendThreshold = this.config.extendThreshold * 60 * 1000; // Convert to milliseconds

      if (timeUntilExpiry < extendThreshold) {
        console.log('Session close to expiry, auto-extending');
        await this.extendSession();
      }
    }
  }

  /**
   * Get device information
   */
  private async getDeviceInfo(): Promise<DeviceInfo> {
    const platformInfo = await new Promise<chrome.runtime.PlatformInfo>((resolve) => {
      chrome.runtime.getPlatformInfo(resolve);
    });

    // Get browser version
    const userAgent = navigator.userAgent;
    const chromeMatch = userAgent.match(/Chrome\/([0-9.]+)/);
    const browserVersion = chromeMatch ? chromeMatch[1] : '120.0.0';

    return {
      type: 'desktop', // Extensions are typically desktop
      os: platformInfo.os,
      browser: 'Chrome',
      browserVersion,
      screenResolution: `${screen.width}x${screen.height}`,
    };
  }

  /**
   * Shutdown session manager
   */
  shutdown(): void {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
    }
  }
}