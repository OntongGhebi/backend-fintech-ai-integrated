import { TransactionIntent } from './transaction-intent.types';

export type TransactionMessageParseStatus =
  'PARSED' | 'UNSUPPORTED' | 'INVALID' | 'ERROR';

export type TransactionMessageAIErrorCode =
  'AI_UNAVAILABLE' | 'AI_TIMEOUT' | 'AI_PROVIDER_ERROR';

export interface TransactionMessageInput {
  userId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  chatId: bigint;
  messageId: bigint;
  text: string;
}

export interface ParsedTransactionMessage {
  status: TransactionMessageParseStatus;
  rawText: string;
  intent?: TransactionIntent;
  errorCode?: TransactionMessageAIErrorCode;
}

export interface TransactionMessageParser {
  parse(input: TransactionMessageInput): Promise<ParsedTransactionMessage>;
}
