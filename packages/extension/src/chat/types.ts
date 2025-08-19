/**
 * Chat Interface Types
 * Type definitions for chat messages, conversations, and UI state
 */

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system' | 'error';
  content: string;
  timestamp: Date;
  metadata?: {
    pageContext?: any;
    actions?: ChatAction[];
    attachments?: ChatAttachment[];
    thinking?: string;
    confidence?: number;
    sources?: string[];
  };
  status?: 'sending' | 'sent' | 'delivered' | 'failed';
  parentId?: string; // For threaded conversations
  reactions?: ChatReaction[];
}

export interface ChatAction {
  id: string;
  type: 'button' | 'link' | 'automation' | 'extract' | 'navigate';
  label: string;
  description?: string;
  icon?: string;
  data?: any;
  disabled?: boolean;
  primary?: boolean;
}

export interface ChatAttachment {
  id: string;
  type: 'image' | 'file' | 'link' | 'code' | 'data';
  name: string;
  url?: string;
  content?: string;
  size?: number;
  mimeType?: string;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  archived?: boolean;
  tags?: string[];
  summary?: string;
}

export interface ChatState {
  currentConversation: ChatConversation | null;
  conversations: ChatConversation[];
  isTyping: boolean;
  isConnected: boolean;
  unreadCount: number;
  settings: ChatSettings;
  ui: ChatUIState;
}

export interface ChatSettings {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoScroll: boolean;
  showTimestamps: boolean;
  compactMode: boolean;
  language: string;
}

export interface ChatUIState {
  isExpanded: boolean;
  isMinimized: boolean;
  activeTab: 'chat' | 'history' | 'settings';
  selectedMessageId?: string;
  searchQuery?: string;
  showEmojiPicker: boolean;
  showAttachmentMenu: boolean;
  inputHeight: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: 'automation' | 'analysis' | 'extraction' | 'general';
  variables?: string[];
  icon?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'page' | 'automation' | 'data' | 'navigation';
  action: () => void;
  shortcut?: string;
}

export interface ChatEvent {
  type: 'message_sent' | 'message_received' | 'typing_start' | 'typing_stop' | 
        'connection_change' | 'conversation_change' | 'settings_change';
  data?: any;
  timestamp: Date;
}

export interface ChatPlugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  commands: ChatCommand[];
  hooks: ChatHook[];
}

export interface ChatCommand {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[], context: any) => Promise<any>;
}

export interface ChatHook {
  event: string;
  handler: (data: any) => void;
}

export interface MessageFormatter {
  format(message: ChatMessage): string;
  supports(type: string): boolean;
}

export interface MessageRenderer {
  render(message: ChatMessage, container: HTMLElement): void;
  update(message: ChatMessage, element: HTMLElement): void;
  cleanup(element: HTMLElement): void;
}