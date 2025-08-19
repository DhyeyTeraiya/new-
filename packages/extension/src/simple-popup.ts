/**
 * Simple Popup Script for Browser AI Agent Extension
 * Minimal popup interface
 */

class SimplePopup {
  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    console.log('🔧 Browser AI Agent Popup Loaded');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupUI());
    } else {
      this.setupUI();
    }
  }

  private async setupUI(): Promise<void> {
    try {
      // Get current session info
      const sessionResponse = await chrome.runtime.sendMessage({
        type: 'GET_SESSION'
      });

      const session = sessionResponse.success ? sessionResponse.session : null;

      // Create popup UI
      document.body.innerHTML = `
        <div style="
          width: 350px;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        ">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">🤖</div>
            <h1 style="margin: 0; font-size: 18px; font-weight: 600;">Browser AI Agent</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Your intelligent web assistant</p>
          </div>

          <div style="
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
            backdrop-filter: blur(10px);
          ">
            <div style="font-size: 14px; margin-bottom: 8px;">
              <strong>Status:</strong> ${session ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            ${session ? `
              <div style="font-size: 12px; opacity: 0.8;">
                Session: ${session.id.substring(0, 8)}...
              </div>
            ` : ''}
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button id="open-chat" style="
              background: rgba(255,255,255,0.2);
              border: 1px solid rgba(255,255,255,0.3);
              color: white;
              padding: 12px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 500;
              transition: all 0.2s ease;
            ">💬 Open Chat Widget</button>

            <button id="analyze-page" style="
              background: rgba(255,255,255,0.2);
              border: 1px solid rgba(255,255,255,0.3);
              color: white;
              padding: 12px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 500;
              transition: all 0.2s ease;
            ">🔍 Analyze Current Page</button>

            <button id="quick-help" style="
              background: rgba(255,255,255,0.2);
              border: 1px solid rgba(255,255,255,0.3);
              color: white;
              padding: 12px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 500;
              transition: all 0.2s ease;
            ">❓ Quick Help</button>
          </div>

          <div style="
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid rgba(255,255,255,0.2);
            text-align: center;
            font-size: 12px;
            opacity: 0.8;
          ">
            Backend: ${this.getBackendStatus()}
          </div>
        </div>
      `;

      // Add event listeners
      this.setupEventListeners();

    } catch (error) {
      console.error('❌ Failed to setup popup UI:', error);
      this.showError('Failed to load popup interface');
    }
  }

  private setupEventListeners(): void {
    // Open chat widget
    document.getElementById('open-chat')?.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_WIDGET' });
          window.close();
        }
      } catch (error) {
        console.error('❌ Failed to open chat widget:', error);
        this.showNotification('Please refresh the page and try again');
      }
    });

    // Analyze page
    document.getElementById('analyze-page')?.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.id) {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
          if (response.success) {
            this.showPageAnalysis(response.pageInfo);
          } else {
            this.showNotification('Failed to analyze page');
          }
        }
      } catch (error) {
        console.error('❌ Failed to analyze page:', error);
        this.showNotification('Please refresh the page and try again');
      }
    });

    // Quick help
    document.getElementById('quick-help')?.addEventListener('click', () => {
      this.showQuickHelp();
    });

    // Add hover effects
    document.querySelectorAll('button').forEach(button => {
      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255,255,255,0.3)';
        button.style.transform = 'translateY(-1px)';
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(255,255,255,0.2)';
        button.style.transform = 'translateY(0)';
      });
    });
  }

  private getBackendStatus(): string {
    // This would check if backend is reachable
    return '🟢 localhost:3000';
  }

  private showPageAnalysis(pageInfo: any): void {
    const analysisHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      ">
        <div style="
          background: white;
          color: #333;
          padding: 24px;
          border-radius: 12px;
          max-width: 400px;
          max-height: 80vh;
          overflow-y: auto;
        ">
          <h3 style="margin: 0 0 16px 0; color: #667eea;">📊 Page Analysis</h3>
          
          <div style="margin-bottom: 16px;">
            <strong>URL:</strong><br>
            <span style="font-size: 12px; word-break: break-all;">${pageInfo.url}</span>
          </div>
          
          <div style="margin-bottom: 16px;">
            <strong>Title:</strong><br>
            ${pageInfo.title}
          </div>
          
          <div style="margin-bottom: 16px;">
            <strong>Interactive Elements:</strong><br>
            ${pageInfo.elements.length} elements found
          </div>
          
          <div style="margin-bottom: 16px;">
            <strong>Element Types:</strong><br>
            ${this.getElementTypeSummary(pageInfo.elements)}
          </div>
          
          <button onclick="this.parentElement.parentElement.remove()" style="
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
          ">Close</button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', analysisHTML);
  }

  private getElementTypeSummary(elements: any[]): string {
    const types = elements.reduce((acc, el) => {
      acc[el.type] = (acc[el.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(types)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
  }

  private showQuickHelp(): void {
    const helpHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      ">
        <div style="
          background: white;
          color: #333;
          padding: 24px;
          border-radius: 12px;
          max-width: 400px;
          max-height: 80vh;
          overflow-y: auto;
        ">
          <h3 style="margin: 0 0 16px 0; color: #667eea;">❓ Quick Help</h3>
          
          <div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0;">How to use:</h4>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Click the 🤖 button on any webpage to open the chat</li>
              <li>Ask me to help with navigation, form filling, or automation</li>
              <li>I can analyze page content and suggest actions</li>
              <li>Use natural language - just tell me what you want to do!</li>
            </ul>
          </div>
          
          <div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0;">Example commands:</h4>
            <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
              <li>"Fill out this form for me"</li>
              <li>"Click the login button"</li>
              <li>"What's on this page?"</li>
              <li>"Help me navigate to the checkout"</li>
            </ul>
          </div>
          
          <button onclick="this.parentElement.parentElement.remove()" style="
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
          ">Got it!</button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', helpHTML);
  }

  private showNotification(message: string): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      z-index: 1000;
      font-size: 14px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  private showError(message: string): void {
    document.body.innerHTML = `
      <div style="
        width: 350px;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        text-align: center;
      ">
        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
        <h2 style="color: #e74c3c; margin: 0 0 8px 0;">Error</h2>
        <p style="color: #666; margin: 0;">${message}</p>
      </div>
    `;
  }
}

// Initialize popup
new SimplePopup();