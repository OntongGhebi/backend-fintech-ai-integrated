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
  description?: string;
  amount?: number;
  transactionType?: 'INCOME' | 'EXPENSE';
  categoryHint?: string;
  accountHint?: string;
  confidence?: number;
}

export interface TransactionMessageParser {
  parse(input: TransactionMessageInput): Promise<ParsedTransactionMessage>;
}
