import { TransactionIntent } from './transaction-intent.types';

export type TransactionMessageParseStatus =
  'PARSED' | 'UNSUPPORTED' | 'INVALID';

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
}

export interface TransactionMessageParser {
  parse(input: TransactionMessageInput): Promise<ParsedTransactionMessage>;
}
