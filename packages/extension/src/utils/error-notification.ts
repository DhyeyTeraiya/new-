import { ProcessedError, ErrorRecoveryAction } from './error-handler';

export interface NotificationOptions {
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
  showRecoveryActions?: boolean;
  persistent?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}

export interface ErrorNotification {
  id: string;
  error: ProcessedError;
  element: HTMLElement;
  options: NotificationOptions;
  createdAt: Date;
}

export class ErrorNotificationManager {
  private static instance: ErrorNotificationManager;
  private notifications: Map<string, ErrorNotification> = new Map();
  private container: HTMLElement | null = null;
  private maxNotifications = 5;

  private constructor() {
    this.createContainer();
    this.setupStyles();
  }

  static getInstance(): ErrorNotificationManager {
    if (!ErrorNotificationManager.instance) {
      ErrorNotificationManager.instance = new ErrorNotificationManager();
    }
    return ErrorNotificationManager.instance;
  }

  /**
   * Show error notification
   */
  showError(
    error: ProcessedError,
    options: NotificationOptions = {}
  ): string {
    const notificationId = `notification_${error.id}`;
    
    // Remove existing notification for the same error
    this.removeNotification(notificationId);

    const finalOptions: NotificationOptions = {
      duration: this.getDefaultDuration(error.severity),
      position: 'top-right',
      showRecoveryActions: true,
      persistent: error.severity === 'critical',
      theme: 'auto',
      ...options,
    };

    const element = this.createNotificationElement(error, finalOptions);
    
    const notification: ErrorNotification = {
      id: notificationId,
      error,
      element,
      options: finalOptions,
      createdAt: new Date(),
    };

    this.notifications.set(notificationId, notification);
    this.addToContainer(element);
    this.animateIn(element);

    // Auto-remove if not persistent
    if (!finalOptions.persistent && finalOptions.duration! > 0) {
      setTimeout(() => {
        this.removeNotification(notificationId);
      }, finalOptions.duration);
    }

    return notificationId;
  }

  /**
   * Remove notification
   */
  removeNotification(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    this.animateOut(notification.element, () => {
      notification.element.remove();
      this.notifications.delete(notificationId);
    });
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    Array.from(this.notifications.keys()).forEach(id => {
      this.removeNotification(id);
    });
  }

  /**
   * Get default duration based on severity
   */
  private getDefaultDuration(severity: ProcessedError['severity']): number {
    switch (severity) {
      case 'critical':
        return 0; // Persistent
      case 'high':
        return 10000; // 10 seconds
      case 'medium':
        return 7000; // 7 seconds
      case 'low':
        return 5000; // 5 seconds
      default:
        return 5000;
    }
  }

  /**
   * Create notification container
   */
  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.id = 'ai-error-notifications';
    this.container.className = 'ai-error-notifications-container';
    document.body.appendChild(this.container);
  }

  /**
   * Setup notification styles
   */
  private setupStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .ai-error-notifications-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10001;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .ai-error-notification {
        pointer-events: auto;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
        margin-bottom: 12px;
        max-width: 400px;
        min-width: 300px;
        overflow: hidden;
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        border-left: 4px solid #ef4444;
      }

      .ai-error-notification.show {
        transform: translateX(0);
      }

      .ai-error-notification.severity-low {
        border-left-color: #3b82f6;
      }

      .ai-error-notification.severity-medium {
        border-left-color: #f59e0b;
      }

      .ai-error-notification.severity-high {
        border-left-color: #ef4444;
      }

      .ai-error-notification.severity-critical {
        border-left-color: #dc2626;
        animation: pulse-critical 2s infinite;
      }

      @keyframes pulse-critical {
        0%, 100% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08); }
        50% { box-shadow: 0 8px 32px rgba(220, 38, 38, 0.2), 0 2px 8px rgba(220, 38, 38, 0.1); }
      }

      .ai-error-notification-header {
        padding: 16px 16px 12px 16px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
      }

      .ai-error-notification-icon {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        margin-right: 12px;
        flex-shrink: 0;
      }

      .ai-error-notification-icon.severity-low {
        background: #dbeafe;
        color: #1d4ed8;
      }

      .ai-error-notification-icon.severity-medium {
        background: #fef3c7;
        color: #d97706;
      }

      .ai-error-notification-icon.severity-high {
        background: #fee2e2;
        color: #dc2626;
      }

      .ai-error-notification-icon.severity-critical {
        background: #fecaca;
        color: #991b1b;
      }

      .ai-error-notification-content {
        flex: 1;
        min-width: 0;
      }

      .ai-error-notification-title {
        font-weight: 600;
        font-size: 14px;
        color: #111827;
        margin-bottom: 4px;
        line-height: 1.4;
      }

      .ai-error-notification-message {
        font-size: 13px;
        color: #6b7280;
        line-height: 1.4;
        margin-bottom: 8px;
      }

      .ai-error-notification-close {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .ai-error-notification-close:hover {
        background: #f3f4f6;
        color: #374151;
      }

      .ai-error-notification-actions {
        padding: 0 16px 16px 52px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .ai-error-notification-action {
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        color: #374151;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .ai-error-notification-action:hover {
        background: #e5e7eb;
        border-color: #d1d5db;
      }

      .ai-error-notification-action.primary {
        background: #3b82f6;
        border-color: #3b82f6;
        color: white;
      }

      .ai-error-notification-action.primary:hover {
        background: #2563eb;
        border-color: #2563eb;
      }

      .ai-error-notification-meta {
        padding: 8px 16px;
        background: #f9fafb;
        border-top: 1px solid #f3f4f6;
        font-size: 11px;
        color: #6b7280;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .ai-error-notification-type {
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
      }

      @media (max-width: 480px) {
        .ai-error-notifications-container {
          left: 12px;
          right: 12px;
          top: 12px;
        }

        .ai-error-notification {
          max-width: none;
          min-width: 0;
        }
      }

      @media (prefers-color-scheme: dark) {
        .ai-error-notification {
          background: #1f2937;
          color: #f9fafb;
        }

        .ai-error-notification-title {
          color: #f9fafb;
        }

        .ai-error-notification-message {
          color: #d1d5db;
        }

        .ai-error-notification-close {
          color: #9ca3af;
        }

        .ai-error-notification-close:hover {
          background: #374151;
          color: #f3f4f6;
        }

        .ai-error-notification-action {
          background: #374151;
          border-color: #4b5563;
          color: #f3f4f6;
        }

        .ai-error-notification-action:hover {
          background: #4b5563;
          border-color: #6b7280;
        }

        .ai-error-notification-meta {
          background: #111827;
          border-color: #374151;
          color: #9ca3af;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Create notification element
   */
  private createNotificationElement(
    error: ProcessedError,
    options: NotificationOptions
  ): HTMLElement {
    const notification = document.createElement('div');
    notification.className = `ai-error-notification severity-${error.severity}`;

    const icon = this.getErrorIcon(error.type, error.severity);
    const title = this.getErrorTitle(error.type, error.severity);

    notification.innerHTML = `
      <div class="ai-error-notification-header">
        <div class="ai-error-notification-icon severity-${error.severity}">
          ${icon}
        </div>
        <div class="ai-error-notification-content">
          <div class="ai-error-notification-title">${title}</div>
          <div class="ai-error-notification-message">${error.userMessage}</div>
        </div>
        <button class="ai-error-notification-close" aria-label="Close notification">×</button>
      </div>
      ${options.showRecoveryActions && error.recoveryActions.length > 0 ? `
        <div class="ai-error-notification-actions">
          ${error.recoveryActions
            .sort((a, b) => a.priority - b.priority)
            .slice(0, 3)
            .map((action, index) => `
              <button class="ai-error-notification-action ${index === 0 ? 'primary' : ''}" 
                      data-action-type="${action.type}"
                      title="${action.description || ''}">
                ${this.getActionIcon(action.type)} ${action.label}
              </button>
            `).join('')}
        </div>
      ` : ''}
      <div class="ai-error-notification-meta">
        <span class="ai-error-notification-type">${error.type}</span>
        <span>${error.timestamp.toLocaleTimeString()}</span>
      </div>
    `;

    // Add event listeners
    this.setupNotificationEvents(notification, error);

    return notification;
  }

  /**
   * Setup notification event listeners
   */
  private setupNotificationEvents(element: HTMLElement, error: ProcessedError): void {
    // Close button
    const closeBtn = element.querySelector('.ai-error-notification-close');
    closeBtn?.addEventListener('click', () => {
      this.removeNotification(`notification_${error.id}`);
    });

    // Recovery action buttons
    const actionButtons = element.querySelectorAll('.ai-error-notification-action');
    actionButtons.forEach((button, index) => {
      button.addEventListener('click', async () => {
        const action = error.recoveryActions[index];
        if (action) {
          try {
            await action.action();
            this.removeNotification(`notification_${error.id}`);
          } catch (actionError) {
            console.error('Recovery action failed:', actionError);
          }
        }
      });
    });

    // Auto-close on click outside (for non-critical errors)
    if (error.severity !== 'critical') {
      element.addEventListener('click', (e) => {
        if (e.target === element) {
          this.removeNotification(`notification_${error.id}`);
        }
      });
    }
  }

  /**
   * Get error icon
   */
  private getErrorIcon(type: ProcessedError['type'], severity: ProcessedError['severity']): string {
    const icons = {
      network: '🌐',
      validation: '⚠️',
      auth: '🔒',
      permission: '🚫',
      server: '🔧',
      client: '💻',
      unknown: '❓',
    };

    if (severity === 'critical') {
      return '🚨';
    }

    return icons[type] || icons.unknown;
  }

  /**
   * Get error title
   */
  private getErrorTitle(type: ProcessedError['type'], severity: ProcessedError['severity']): string {
    const titles = {
      network: 'Connection Error',
      validation: 'Invalid Input',
      auth: 'Authentication Required',
      permission: 'Access Denied',
      server: 'Server Error',
      client: 'Application Error',
      unknown: 'Unexpected Error',
    };

    if (severity === 'critical') {
      return 'Critical Error';
    }

    return titles[type] || titles.unknown;
  }

  /**
   * Get action icon
   */
  private getActionIcon(type: ErrorRecoveryAction['type']): string {
    const icons = {
      retry: '🔄',
      fallback: '🔀',
      redirect: '↗️',
      refresh: '🔄',
      manual: '👤',
    };

    return icons[type] || '';
  }

  /**
   * Add notification to container
   */
  private addToContainer(element: HTMLElement): void {
    if (!this.container) return;

    // Remove oldest notifications if at max capacity
    while (this.notifications.size >= this.maxNotifications) {
      const oldestId = Array.from(this.notifications.keys())[0];
      this.removeNotification(oldestId);
    }

    this.container.appendChild(element);
  }

  /**
   * Animate notification in
   */
  private animateIn(element: HTMLElement): void {
    requestAnimationFrame(() => {
      element.classList.add('show');
    });
  }

  /**
   * Animate notification out
   */
  private animateOut(element: HTMLElement, callback: () => void): void {
    element.classList.remove('show');
    setTimeout(callback, 300);
  }

  /**
   * Get active notifications count
   */
  getActiveCount(): number {
    return this.notifications.size;
  }

  /**
   * Get notifications by severity
   */
  getNotificationsBySeverity(severity: ProcessedError['severity']): ErrorNotification[] {
    return Array.from(this.notifications.values()).filter(
      notification => notification.error.severity === severity
    );
  }
}

export default ErrorNotificationManager;