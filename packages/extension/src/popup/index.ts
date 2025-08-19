/**
 * Browser AI Agent Extension Popup
 */

interface PopupState {
  connected: boolean;
  sessionId: string | null;
  loading: boolean;
  error: string | null;
}

class PopupController {
  private state: PopupState = {
    connected: false,
    sessionId: null,
    loading: false,
    error: null
  };

  private elements: {
    status: HTMLElement;
    connectBtn: HTMLButtonElement;
    connectText: HTMLElement;
    chatBtn: HTMLButtonElement;
    automateBtn: HTMLButtonElement;
    extractBtn: HTMLButtonElement;
    sessionInfo: HTMLElement;
    sessionId: HTMLElement;
    connectedTime: HTMLElement;
    error: HTMLElement;
  };

  constructor() {
    this.elements = {
      status: document.getElementById('status')!,
      connectBtn: document.getElementById('connectBtn') as HTMLButtonElement,
      connectText: document.getElementById('connectText')!,
      chatBtn: document.getElementById('chatBtn') as HTMLButtonElement,
      automateBtn: document.getElementById('automateBtn') as HTMLButtonElement,
      extractBtn: document.getElementById('extractBtn') as HTMLButtonElement,
      sessionInfo: document.getElementById('sessionInfo')!,
      sessionId: document.getElementById('sessionId')!,
      connectedTime: document.getElementById('connectedTime')!,
      error: document.getElementById('error')!
    };

    this.init();
  }

  private async init(): Promise<void> {
    this.setupEventListeners();
    await this.checkConnectionStatus();
  }

  private setupEventListeners(): void {
    this.elements.connectBtn.addEventListener('click', () => {
      if (this.state.connected) {
        this.disconnect();
      } else {
        this.connect();
      }
    });

    this.elements.chatBtn.addEventListener('click', () => {
      this.openChatWidget();
    });

    this.elements.automateBtn.addEventListener('click', () => {
      this.startAutomation();
    });

    this.elements.extractBtn.addEventListener('click', () => {
      this.extractPageData();
    });
  }

  private async checkConnectionStatus(): Promise<void> {
    try {
      const response = await this.sendMessageToBackground({\n        type: 'GET_SESSION'\n      });\n\n      if (response.success && response.data) {\n        this.updateState({\n          connected: response.data.hasToken && response.data.wsConnected,\n          sessionId: response.data.sessionId\n        });\n      }\n    } catch (error) {\n      console.error('Failed to check connection status:', error);\n      this.showError('Failed to check connection status');\n    }\n  }\n\n  private async connect(): Promise<void> {\n    this.updateState({ loading: true, error: null });\n\n    try {\n      // Create new session\n      const sessionResponse = await this.sendMessageToBackground({\n        type: 'CREATE_SESSION',\n        data: {\n          preferences: {\n            theme: 'light',\n            language: 'en'\n          }\n        }\n      });\n\n      if (sessionResponse.success) {\n        // Connect WebSocket\n        const wsResponse = await this.sendMessageToBackground({\n          type: 'CONNECT_WEBSOCKET'\n        });\n\n        if (wsResponse.success) {\n          this.updateState({\n            connected: true,\n            sessionId: sessionResponse.data.id,\n            loading: false\n          });\n        } else {\n          throw new Error('Failed to connect WebSocket');\n        }\n      } else {\n        throw new Error('Failed to create session');\n      }\n    } catch (error) {\n      console.error('Connection failed:', error);\n      this.showError(error instanceof Error ? error.message : 'Connection failed');\n      this.updateState({ loading: false });\n    }\n  }\n\n  private async disconnect(): Promise<void> {\n    this.updateState({ loading: true });\n\n    try {\n      await this.sendMessageToBackground({\n        type: 'DISCONNECT_WEBSOCKET'\n      });\n\n      this.updateState({\n        connected: false,\n        sessionId: null,\n        loading: false\n      });\n    } catch (error) {\n      console.error('Disconnect failed:', error);\n      this.showError('Disconnect failed');\n      this.updateState({ loading: false });\n    }\n  }\n\n  private async openChatWidget(): Promise<void> {\n    try {\n      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n      if (tab.id) {\n        await chrome.tabs.sendMessage(tab.id, {\n          type: 'OPEN_CHAT_WIDGET'\n        });\n        window.close();\n      }\n    } catch (error) {\n      console.error('Failed to open chat widget:', error);\n      this.showError('Failed to open chat widget');\n    }\n  }\n\n  private async startAutomation(): Promise<void> {\n    try {\n      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n      if (tab.id) {\n        await chrome.tabs.sendMessage(tab.id, {\n          type: 'START_AUTOMATION_MODE'\n        });\n        window.close();\n      }\n    } catch (error) {\n      console.error('Failed to start automation:', error);\n      this.showError('Failed to start automation');\n    }\n  }\n\n  private async extractPageData(): Promise<void> {\n    try {\n      const response = await this.sendMessageToBackground({\n        type: 'SEND_CHAT_MESSAGE',\n        data: {\n          message: 'Extract all important data from this page',\n          includeContext: true\n        }\n      });\n\n      if (response.success) {\n        await this.openChatWidget();\n      } else {\n        throw new Error('Failed to send extraction request');\n      }\n    } catch (error) {\n      console.error('Failed to extract page data:', error);\n      this.showError('Failed to extract page data');\n    }\n  }\n\n  private updateState(updates: Partial<PopupState>): void {\n    this.state = { ...this.state, ...updates };\n    this.render();\n  }\n\n  private render(): void {\n    // Update connection status\n    if (this.state.connected) {\n      this.elements.status.className = 'status connected';\n      this.elements.status.innerHTML = '<div class=\"status-dot\"></div><span>Connected</span>';\n    } else {\n      this.elements.status.className = 'status disconnected';\n      this.elements.status.innerHTML = '<div class=\"status-dot\"></div><span>Disconnected</span>';\n    }\n\n    // Update connect button\n    if (this.state.loading) {\n      this.elements.connectText.innerHTML = '<div class=\"loading\"></div>Connecting...';\n      this.elements.connectBtn.disabled = true;\n    } else if (this.state.connected) {\n      this.elements.connectText.textContent = 'Disconnect';\n      this.elements.connectBtn.disabled = false;\n      this.elements.connectBtn.className = 'btn btn-secondary';\n    } else {\n      this.elements.connectText.textContent = 'Connect to AI';\n      this.elements.connectBtn.disabled = false;\n      this.elements.connectBtn.className = 'btn btn-primary';\n    }\n\n    // Update action buttons\n    const actionsEnabled = this.state.connected && !this.state.loading;\n    this.elements.chatBtn.disabled = !actionsEnabled;\n    this.elements.automateBtn.disabled = !actionsEnabled;\n    this.elements.extractBtn.disabled = !actionsEnabled;\n\n    // Update session info\n    if (this.state.connected && this.state.sessionId) {\n      this.elements.sessionInfo.style.display = 'block';\n      this.elements.sessionId.textContent = this.state.sessionId.substring(0, 8) + '...';\n      this.elements.connectedTime.textContent = new Date().toLocaleTimeString();\n    } else {\n      this.elements.sessionInfo.style.display = 'none';\n    }\n\n    // Update error display\n    if (this.state.error) {\n      this.elements.error.textContent = this.state.error;\n      this.elements.error.style.display = 'block';\n    } else {\n      this.elements.error.style.display = 'none';\n    }\n  }\n\n  private showError(message: string): void {\n    this.updateState({ error: message });\n    setTimeout(() => {\n      this.updateState({ error: null });\n    }, 5000);\n  }\n\n  private async sendMessageToBackground(message: any): Promise<any> {\n    return new Promise((resolve, reject) => {\n      chrome.runtime.sendMessage(message, (response) => {\n        if (chrome.runtime.lastError) {\n          reject(new Error(chrome.runtime.lastError.message));\n        } else {\n          resolve(response);\n        }\n      });\n    });\n  }\n}\n\n// Initialize popup when DOM is loaded\nif (document.readyState === 'loading') {\n  document.addEventListener('DOMContentLoaded', () => {\n    new PopupController();\n  });\n} else {\n  new PopupController();\n}"