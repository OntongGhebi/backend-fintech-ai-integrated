export type AIConversationContextRole = 'SYSTEM' | 'USER' | 'ASSISTANT';

export interface AIConversationContextMessage {
  role: AIConversationContextRole;
  content: string;
}

export interface AIConversationContextOptions {
  limit?: number;
}

export interface AIConversationContextResult {
  conversationId: string;
  messages: AIConversationContextMessage[];
}
