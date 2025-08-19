/**
 * Chat Module Entry Point
 * Exports all chat-related components and utilities
 */

export { ChatManager } from './chat-manager';
export { ChatUI } from './chat-ui';
export { MessageRenderer } from './message-renderer';
export { MessageStorage } from './message-storage';

export * from './types';

// Re-export for convenience
export type {
  ChatMessage,
  ChatConversation,
  ChatState,
  ChatSettings,
  ChatUIState,
  ChatAction,
  ChatAttachment,
  MessageTemplate,
  QuickAction,
  ChatEvent
} from './types';