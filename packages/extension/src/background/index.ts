import { 
  WebSocketMessage, 
  UserSession, 
  APIResponse,
  SessionCreateRequest,
  DeviceInfo 
} from '@browser-ai-agent/shared';

// Configuration
const CONFIG = {
  API_BASE_URL: 'http://localhost:3000/api/v1',
  WS_URL: 'ws://localhost:3000',
  STORAGE_KEYS: {
    SESSION_ID: 'browser_ai_session_id',
    AUTH_TOKEN: 'browser_ai_auth_token',
    USER_PREFERENCES: 'browser_ai_preferences',
    CONNECTION_STATE: 'browser_ai_connection_state',
  },
  RECONNECT_DELAY: 5000,
  MAX_RECONNECT_ATTEMPTS: 5,
};

// Global state
let currentSession: UserSession | null = null;
let authToken: string | null = null;
let websocket: WebSocket | null = null;
let reconnectAttempts = 0;
let isConnecting = false;

/**
 * Background script initialization
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Browser AI Agent installed:', details.reason);
  
  // Initialize extension
  await initializeExtension();
  
  // Set up context menus
  setupContextMenus();
  
  // Show welcome notification
  if (details.reason === 'install') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icon48.png',
      title: 'Browser AI Agent',
      message: 'Extension installed successfully! Click the extension icon to get started.',
    });
  }
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('Browser AI Agent starting up');
  await initializeExtension();
});

/**
 * Initialize extension
 */
async function initializeExtension(): Promise<void> {
  try {
    // Load stored session and auth token
    const stored = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.SESSION_ID,
      CONFIG.STORAGE_KEYS.AUTH_TOKEN,
      CONFIG.STORAGE_KEYS.USER_PREFERENCES,
    ]);

    authToken = stored[CONFIG.STORAGE_KEYS.AUTH_TOKEN] || null;
    
    if (stored[CONFIG.STORAGE_KEYS.SESSION_ID] && authToken) {
      // Try to restore existing session
      await restoreSession(stored[CONFIG.STORAGE_KEYS.SESSION_ID]);
    } else {
      // Create new session
      await createNewSession();
    }

    // Connect to WebSocket
    await connectWebSocket();

  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
}

/**
 * Create new session
 */
async function createNewSession(): Promise<void> {
  try {
    const deviceInfo: DeviceInfo = {
      type: 'desktop',
      os: await getOperatingSystem(),
      browser: 'Chrome',
      browserVersion: await getBrowserVersion(),
      screenResolution: `${screen.width}x${screen.height}`,
    };

    const sessionRequest: SessionCreateRequest = {
      deviceInfo,
      preferences: {
        theme: 'light',
        language: 'en',
        automation: {
          autoConfirmLowRisk: false,
          showActionPreviews: true,
          defaultTimeout: 5000,
          takeScreenshots: true,
          highlightElements: true,
        },
        privacy: {
          storeHistory: true,
          shareAnalytics: false,
          dataRetentionDays: 30,
        },
        notifications: {
          desktop: true,
          browser: true,
          actionCompletion: true,
          errors: true,
        },
        ai: {
          responseStyle: 'conversational',
          explainActions: true,
          confidenceThreshold: 0.7,
          modelPreferences: {
            chat: 'primary',
            reasoning: 'complex',
            vision: 'vision',
            fast: 'primary',
          },
        },
      },
    };

    const response = await fetch(`${CONFIG.API_BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionRequest),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const result: APIResponse<{ session: UserSession; token: string }> = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error('Invalid session creation response');
    }

    currentSession = result.data.session;
    authToken = result.data.token;

    // Store session data
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.SESSION_ID]: currentSession.id,
      [CONFIG.STORAGE_KEYS.AUTH_TOKEN]: authToken,
      [CONFIG.STORAGE_KEYS.USER_PREFERENCES]: currentSession.preferences,
    });

    console.log('New session created:', currentSession.id);

  } catch (error) {
    console.error('Failed to create session:', error);
    throw error;
  }
}

/**
 * Restore existing session
 */
async function restoreSession(sessionId: string): Promise<void> {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 401) {
        // Session expired or invalid, create new one
        await createNewSession();
        return;
      }
      throw new Error(`Failed to restore session: ${response.statusText}`);
    }

    const result: APIResponse<{ session: UserSession }> = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error('Invalid session restore response');
    }

    currentSession = result.data.session;
    console.log('Session restored:', currentSession.id);

  } catch (error) {
    console.error('Failed to restore session:', error);
    // Fallback to creating new session
    await createNewSession();
  }
}

/**
 * Connect to WebSocket server
 */
async function connectWebSocket(): Promise<void> {
  if (isConnecting || (websocket && websocket.readyState === WebSocket.OPEN)) {
    return;
  }

  if (!currentSession || !authToken) {
    console.error('Cannot connect WebSocket: No session or auth token');
    return;
  }

  isConnecting = true;

  try {
    const wsUrl = `${CONFIG.WS_URL}?token=${authToken}&sessionId=${currentSession.id}&clientType=extension&clientVersion=1.0.0`;
    
    websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      isConnecting = false;
      reconnectAttempts = 0;
      
      // Update connection state
      chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.CONNECTION_STATE]: 'connected',
      });

      // Notify content scripts
      broadcastToContentScripts({
        type: 'CONNECTION_STATUS',
        payload: { status: 'connected' },
      });
    };

    websocket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    websocket.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      isConnecting = false;
      websocket = null;

      // Update connection state
      chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.CONNECTION_STATE]: 'disconnected',
      });

      // Notify content scripts
      broadcastToContentScripts({
        type: 'CONNECTION_STATUS',
        payload: { status: 'disconnected' },
      });

      // Attempt reconnection
      if (reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        setTimeout(() => {
          reconnectAttempts++;
          console.log(`Attempting WebSocket reconnection (${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
          connectWebSocket();
        }, CONFIG.RECONNECT_DELAY * Math.pow(2, reconnectAttempts));
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      isConnecting = false;
    };

  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
    isConnecting = false;
  }
}

/**
 * Handle WebSocket messages
 */
function handleWebSocketMessage(message: WebSocketMessage): void {
  console.log('WebSocket message received:', message.type);

  switch (message.type) {
    case 'ai_response':
      // Forward AI responses to content scripts
      broadcastToContentScripts({
        type: 'AI_RESPONSE',
        payload: message.payload,
      });
      break;

    case 'action_progress':
      // Forward action progress to content scripts
      broadcastToContentScripts({
        type: 'ACTION_PROGRESS',
        payload: message.payload,
      });
      break;

    case 'action_complete':
      // Forward action completion to content scripts
      broadcastToContentScripts({
        type: 'ACTION_COMPLETE',
        payload: message.payload,
      });
      break;

    case 'action_error':
      // Forward action errors to content scripts
      broadcastToContentScripts({
        type: 'ACTION_ERROR',
        payload: message.payload,
      });
      break;

    case 'automation_progress':
      // Forward automation progress to content scripts
      broadcastToContentScripts({
        type: 'AUTOMATION_PROGRESS',
        payload: message.payload,
      });
      break;

    case 'screenshot':
      // Handle screenshot responses
      broadcastToContentScripts({
        type: 'SCREENSHOT_RESPONSE',
        payload: message.payload,
      });
      break;

    case 'element_highlight':
      // Forward element highlighting to content scripts
      broadcastToContentScripts({
        type: 'ELEMENT_HIGHLIGHT',
        payload: message.payload,
      });
      break;

    case 'session_update':
      // Update local session state
      if (currentSession && message.payload.updates) {
        currentSession = { ...currentSession, ...message.payload.updates };
        chrome.storage.local.set({
          [CONFIG.STORAGE_KEYS.USER_PREFERENCES]: currentSession.preferences,
        });
      }
      break;

    case 'error':
      console.error('WebSocket error message:', message.payload);
      // Show error notification if enabled
      if (currentSession?.preferences.notifications.errors) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon48.png',
          title: 'Browser AI Agent Error',
          message: message.payload.message || 'An error occurred',
        });
      }
      break;

    case 'pong':
      // Handle heartbeat response
      break;

    default:
      console.log('Unhandled WebSocket message type:', message.type);
  }
}

/**
 * Send WebSocket message
 */
function sendWebSocketMessage(message: Omit<WebSocketMessage, 'id' | 'timestamp'>): void {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected');
    return;
  }

  const fullMessage: WebSocketMessage = {
    id: generateId(),
    timestamp: new Date(),
    ...message,
  };

  websocket.send(JSON.stringify(fullMessage));
}

/**
 * Broadcast message to all content scripts
 */
async function broadcastToContentScripts(message: any): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // Ignore errors for tabs without content scripts
        }
      }
    }
  } catch (error) {
    console.error('Failed to broadcast to content scripts:', error);
  }
}

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message from content script:', message.type);

  switch (message.type) {
    case 'SEND_CHAT_MESSAGE':
      if (currentSession) {
        sendWebSocketMessage({
          type: 'chat_message',
          sessionId: currentSession.id,
          payload: {
            message: message.payload.message,
            messageType: message.payload.messageType || 'command',
            pageContext: message.payload.pageContext,
          },
        });
      }
      break;

    case 'REQUEST_SCREENSHOT':
      if (currentSession) {
        sendWebSocketMessage({
          type: 'screenshot_request',
          sessionId: currentSession.id,
          payload: message.payload,
        });
      }
      break;

    case 'PAGE_CHANGED':
      if (currentSession) {
        sendWebSocketMessage({
          type: 'page_change',
          sessionId: currentSession.id,
          payload: message.payload,
        });
      }
      break;

    case 'GET_SESSION_INFO':
      sendResponse({
        session: currentSession,
        authToken: authToken,
        connected: websocket?.readyState === WebSocket.OPEN,
      });
      break;

    case 'PING':
      if (currentSession) {
        sendWebSocketMessage({
          type: 'ping',
          sessionId: currentSession.id,
          payload: { timestamp: Date.now() },
        });
      }
      break;

    default:
      console.log('Unhandled message from content script:', message.type);
  }

  return true; // Keep message channel open for async response
});

/**
 * Setup context menus
 */
function setupContextMenus(): void {
  chrome.contextMenus.create({
    id: 'browser-ai-agent-help',
    title: 'Ask Browser AI Agent',
    contexts: ['selection', 'page'],
  });

  chrome.contextMenus.create({
    id: 'browser-ai-agent-extract',
    title: 'Extract with AI Agent',
    contexts: ['selection'],
  });
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !currentSession) return;

  try {
    switch (info.menuItemId) {
      case 'browser-ai-agent-help':
        const helpMessage = info.selectionText 
          ? `Help me understand: "${info.selectionText}"`
          : 'Help me with this page';
        
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_WIDGET',
          payload: { message: helpMessage },
        });
        break;

      case 'browser-ai-agent-extract':
        if (info.selectionText) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_WIDGET',
            payload: { message: `Extract information about: "${info.selectionText}"` },
          });
        }
        break;
    }
  } catch (error) {
    console.error('Failed to handle context menu click:', error);
  }
});

/**
 * Handle tab updates to track page changes
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    // Notify content script about page load completion
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'PAGE_LOADED',
        payload: { url: tab.url, title: tab.title },
      });
    } catch (error) {
      // Content script might not be ready yet
    }
  }
});

/**
 * Utility functions
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function getOperatingSystem(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.getPlatformInfo((info) => {
      resolve(info.os);
    });
  });
}

async function getBrowserVersion(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.getManifest();
    // Get Chrome version from user agent
    const match = navigator.userAgent.match(/Chrome\/([0-9.]+)/);
    resolve(match ? match[1] : '120.0.0');
  });
}

// Heartbeat to keep WebSocket alive
setInterval(() => {
  if (websocket && websocket.readyState === WebSocket.OPEN && currentSession) {
    sendWebSocketMessage({
      type: 'ping',
      sessionId: currentSession.id,
      payload: { timestamp: Date.now() },
    });
  }
}, 30000); // Every 30 seconds

console.log('Browser AI Agent Background Script initialized');