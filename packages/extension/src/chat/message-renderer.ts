/**
 * Message Renderer
 * Handles rendering and updating chat messages in the UI
 */

import { ChatMessage, ChatAction, MessageRenderer as IMessageRenderer } from './types';

export class MessageRenderer implements IMessageRenderer {
  private formatters: Map<string, (content: string) => string> = new Map();
  private actionHandlers: Map<string, (action: ChatAction, message: ChatMessage) => void> = new Map();

  constructor() {
    this.setupDefaultFormatters();
  }

  /**
   * Render a message in the container
   */
  render(message: ChatMessage, container: HTMLElement): void {
    const messageElement = this.createMessageElement(message);
    container.appendChild(messageElement);
    
    // Add entrance animation
    requestAnimationFrame(() => {
      messageElement.classList.add('message-visible');
    });
  }

  /**
   * Update an existing message element
   */
  update(message: ChatMessage, element: HTMLElement): void {
    const contentElement = element.querySelector('.message-content');
    const statusElement = element.querySelector('.message-status');
    const actionsElement = element.querySelector('.message-actions');

    if (contentElement) {
      contentElement.innerHTML = this.formatContent(message);
    }

    if (statusElement && message.status) {
      statusElement.textContent = this.getStatusText(message.status);
      statusElement.className = `message-status status-${message.status}`;
    }

    if (actionsElement && message.metadata?.actions) {
      actionsElement.innerHTML = '';
      this.renderActions(message.metadata.actions, actionsElement, message);
    }

    // Update timestamp
    const timestampElement = element.querySelector('.message-timestamp');
    if (timestampElement) {
      timestampElement.textContent = this.formatTimestamp(message.timestamp);
    }
  }

  /**
   * Cleanup message element
   */
  cleanup(element: HTMLElement): void {
    // Remove event listeners
    const actionButtons = element.querySelectorAll('.action-button');
    actionButtons.forEach(button => {
      button.removeEventListener('click', this.handleActionClick);
    });

    // Remove from DOM
    element.remove();
  }

  /**
   * Create message element
   */
  private createMessageElement(message: ChatMessage): HTMLElement {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${message.type}`;
    messageDiv.setAttribute('data-message-id', message.id);

    // Add parent reference for threaded messages
    if (message.parentId) {
      messageDiv.setAttribute('data-parent-id', message.parentId);
      messageDiv.classList.add('message-reply');
    }

    messageDiv.innerHTML = `
      <div class="message-avatar">
        ${this.getAvatarContent(message.type)}
      </div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">${this.getSenderName(message.type)}</span>
          <span class="message-timestamp">${this.formatTimestamp(message.timestamp)}</span>
          ${message.status ? `<span class="message-status status-${message.status}">${this.getStatusText(message.status)}</span>` : ''}
        </div>
        <div class="message-content">${this.formatContent(message)}</div>
        ${message.metadata?.thinking ? `<div class="message-thinking">${message.metadata.thinking}</div>` : ''}
        ${message.metadata?.actions ? '<div class="message-actions"></div>' : ''}
        ${message.metadata?.attachments ? '<div class="message-attachments"></div>' : ''}
        <div class="message-footer">
          ${this.renderMessageFooter(message)}
        </div>
      </div>
    `;

    // Render actions if present
    if (message.metadata?.actions) {
      const actionsContainer = messageDiv.querySelector('.message-actions')!;
      this.renderActions(message.metadata.actions, actionsContainer, message);
    }

    // Render attachments if present
    if (message.metadata?.attachments) {
      const attachmentsContainer = messageDiv.querySelector('.message-attachments')!;
      this.renderAttachments(message.metadata.attachments, attachmentsContainer);
    }

    return messageDiv;
  }

  /**
   * Format message content
   */
  private formatContent(message: ChatMessage): string {
    let content = message.content;

    // Apply formatters based on message type
    const formatter = this.formatters.get(message.type);
    if (formatter) {
      content = formatter(content);
    }

    // Apply general formatting
    content = this.applyGeneralFormatting(content);

    return content;
  }

  /**
   * Apply general formatting (markdown-like)
   */
  private applyGeneralFormatting(content: string): string {
    // Bold text
    content = content.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
    
    // Italic text
    content = content.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
    
    // Code blocks
    content = content.replace(/```([\\s\\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links
    content = content.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    
    // Line breaks
    content = content.replace(/\\n/g, '<br>');

    return content;
  }

  /**
   * Setup default formatters
   */
  private setupDefaultFormatters(): void {
    // System message formatter
    this.formatters.set('system', (content: string) => {
      return `<div class="system-message-content">${content}</div>`;
    });

    // Error message formatter
    this.formatters.set('error', (content: string) => {
      return `<div class="error-message-content">⚠️ ${content}</div>`;
    });

    // AI message formatter with enhanced features
    this.formatters.set('ai', (content: string) => {
      // Handle structured responses
      if (content.startsWith('{') && content.endsWith('}')) {
        try {
          const parsed = JSON.parse(content);
          return this.formatStructuredResponse(parsed);
        } catch {
          // Fall back to regular formatting
        }
      }
      
      return content;
    });
  }

  /**
   * Format structured AI response
   */
  private formatStructuredResponse(response: any): string {
    if (response.type === 'analysis') {
      return `
        <div class="structured-response analysis">
          <h4>📊 Page Analysis</h4>
          <div class="analysis-content">
            ${response.summary ? `<p><strong>Summary:</strong> ${response.summary}</p>` : ''}
            ${response.keyPoints ? `
              <div class="key-points">
                <strong>Key Points:</strong>
                <ul>
                  ${response.keyPoints.map((point: string) => `<li>${point}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${response.recommendations ? `
              <div class="recommendations">
                <strong>Recommendations:</strong>
                <ul>
                  ${response.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    if (response.type === 'extraction') {
      return `
        <div class="structured-response extraction">
          <h4>📋 Extracted Data</h4>
          <div class="extraction-content">
            ${this.formatExtractedData(response.data)}
          </div>
        </div>
      `;
    }

    if (response.type === 'automation') {
      return `
        <div class="structured-response automation">
          <h4>🤖 Automation Plan</h4>
          <div class="automation-content">
            ${response.steps ? `
              <ol class="automation-steps">
                ${response.steps.map((step: any) => `
                  <li class="automation-step">
                    <strong>${step.action}</strong>
                    ${step.description ? `<br><small>${step.description}</small>` : ''}
                  </li>
                `).join('')}
              </ol>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Default structured response
    return `<pre><code>${JSON.stringify(response, null, 2)}</code></pre>`;
  }

  /**
   * Format extracted data
   */
  private formatExtractedData(data: any): string {
    if (Array.isArray(data)) {
      if (data.length === 0) return '<p>No data found</p>';
      
      // Check if it's tabular data
      if (data[0] && typeof data[0] === 'object') {
        return this.formatTable(data);
      }
      
      // List format
      return `
        <ul class="extracted-list">
          ${data.map(item => `<li>${typeof item === 'object' ? JSON.stringify(item) : item}</li>`).join('')}
        </ul>
      `;
    }

    if (typeof data === 'object') {
      return `
        <div class="extracted-object">
          ${Object.entries(data).map(([key, value]) => `
            <div class="data-row">
              <strong>${key}:</strong> 
              <span>${typeof value === 'object' ? JSON.stringify(value) : value}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `<p>${data}</p>`;
  }

  /**
   * Format data as table
   */
  private formatTable(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    
    return `
      <table class="extracted-table">
        <thead>
          <tr>
            ${headers.map(header => `<th>${header}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>
              ${headers.map(header => `<td>${row[header] || ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /**
   * Render message actions
   */
  private renderActions(actions: ChatAction[], container: HTMLElement, message: ChatMessage): void {
    actions.forEach(action => {
      const button = document.createElement('button');
      button.className = `action-button action-${action.type} ${action.primary ? 'primary' : 'secondary'}`;
      button.disabled = action.disabled || false;
      
      if (action.icon) {
        button.innerHTML = `<span class="action-icon">${action.icon}</span> ${action.label}`;
      } else {
        button.textContent = action.label;
      }

      if (action.description) {
        button.title = action.description;
      }

      button.addEventListener('click', () => this.handleActionClick(action, message));
      container.appendChild(button);
    });
  }

  /**
   * Render message attachments
   */
  private renderAttachments(attachments: any[], container: HTMLElement): void {
    attachments.forEach(attachment => {
      const attachmentDiv = document.createElement('div');
      attachmentDiv.className = `attachment attachment-${attachment.type}`;

      switch (attachment.type) {
        case 'image':
          attachmentDiv.innerHTML = `
            <img src="${attachment.url}" alt="${attachment.name}" class="attachment-image" />
            <div class="attachment-info">
              <span class="attachment-name">${attachment.name}</span>
              ${attachment.size ? `<span class="attachment-size">${this.formatFileSize(attachment.size)}</span>` : ''}
            </div>
          `;
          break;

        case 'file':
          attachmentDiv.innerHTML = `
            <div class="attachment-icon">📄</div>
            <div class="attachment-info">
              <a href="${attachment.url}" target="_blank" class="attachment-name">${attachment.name}</a>
              ${attachment.size ? `<span class="attachment-size">${this.formatFileSize(attachment.size)}</span>` : ''}
            </div>
          `;
          break;

        case 'link':
          attachmentDiv.innerHTML = `
            <div class="attachment-icon">🔗</div>
            <div class="attachment-info">
              <a href="${attachment.url}" target="_blank" class="attachment-name">${attachment.name}</a>
            </div>
          `;
          break;

        case 'code':
          attachmentDiv.innerHTML = `
            <div class="attachment-icon">💻</div>
            <div class="attachment-info">
              <span class="attachment-name">${attachment.name}</span>
              <pre><code>${attachment.content}</code></pre>
            </div>
          `;
          break;

        default:
          attachmentDiv.innerHTML = `
            <div class="attachment-icon">📎</div>
            <div class="attachment-info">
              <span class="attachment-name">${attachment.name}</span>
            </div>
          `;
      }

      container.appendChild(attachmentDiv);
    });
  }

  /**
   * Render message footer
   */
  private renderMessageFooter(message: ChatMessage): string {
    const parts: string[] = [];

    // Confidence score
    if (message.metadata?.confidence !== undefined) {
      const confidence = Math.round(message.metadata.confidence * 100);
      parts.push(`<span class="confidence">Confidence: ${confidence}%</span>`);
    }

    // Sources
    if (message.metadata?.sources && message.metadata.sources.length > 0) {
      parts.push(`<span class="sources">Sources: ${message.metadata.sources.length}</span>`);
    }

    // Reactions
    if (message.reactions && message.reactions.length > 0) {
      const reactionsHtml = message.reactions.map(reaction => 
        `<span class="reaction" data-emoji="${reaction.emoji}">
          ${reaction.emoji} ${reaction.count}
        </span>`
      ).join('');
      parts.push(`<div class="message-reactions">${reactionsHtml}</div>`);
    }

    return parts.join(' ');
  }

  /**
   * Handle action button clicks
   */
  private handleActionClick = (action: ChatAction, message: ChatMessage): void => {
    const handler = this.actionHandlers.get(action.type);
    if (handler) {
      handler(action, message);
    } else {
      // Default action handling
      this.executeDefaultAction(action, message);
    }
  };

  /**
   * Execute default action
   */
  private executeDefaultAction(action: ChatAction, message: ChatMessage): void {
    switch (action.type) {
      case 'button':
        // Emit custom event for button actions
        window.dispatchEvent(new CustomEvent('chat-action', {
          detail: { action, message }
        }));
        break;

      case 'link':
        if (action.data?.url) {
          window.open(action.data.url, '_blank', 'noopener,noreferrer');
        }
        break;

      case 'automation':
        // Send automation command
        window.dispatchEvent(new CustomEvent('chat-automation', {
          detail: { action: action.data, message }
        }));
        break;

      case 'extract':
        // Send extraction command
        window.dispatchEvent(new CustomEvent('chat-extract', {
          detail: { action: action.data, message }
        }));
        break;

      case 'navigate':
        if (action.data?.url) {
          window.location.href = action.data.url;
        }
        break;
    }
  }

  /**
   * Register action handler
   */
  registerActionHandler(type: string, handler: (action: ChatAction, message: ChatMessage) => void): void {
    this.actionHandlers.set(type, handler);
  }

  /**
   * Register content formatter
   */
  registerFormatter(type: string, formatter: (content: string) => string): void {
    this.formatters.set(type, formatter);
  }

  /**
   * Helper methods
   */

  private getAvatarContent(type: string): string {
    switch (type) {
      case 'user':
        return '<div class="avatar-user">👤</div>';
      case 'ai':
        return '<div class="avatar-ai">🤖</div>';
      case 'system':
        return '<div class="avatar-system">ℹ️</div>';
      case 'error':
        return '<div class="avatar-error">⚠️</div>';
      default:
        return '<div class="avatar-default">💬</div>';
    }
  }

  private getSenderName(type: string): string {
    switch (type) {
      case 'user':
        return 'You';
      case 'ai':
        return 'AI Assistant';
      case 'system':
        return 'System';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  }

  private getStatusText(status: string): string {
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'failed':
        return 'Failed';
      default:
        return '';
    }
  }

  private formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    
    // Less than 1 minute
    if (diff < 60000) {
      return 'Just now';
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    
    // More than 24 hours
    return timestamp.toLocaleDateString();
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}