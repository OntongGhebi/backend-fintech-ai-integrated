import { Inject, Injectable, Logger } from '@nestjs/common';

import { TELEGRAM_DETERMINISTIC_TRANSACTION_MESSAGE_PARSER } from '../../telegram.tokens';

import type {
  ParsedTransactionMessage,
  TransactionMessageInput,
  TransactionMessageParser,
} from '../types/transaction-message.types';

import { AITransactionMessageParser } from './ai-transaction-message.parser';

@Injectable()
export class TelegramTransactionMessageParser implements TransactionMessageParser {
  private readonly logger = new Logger(TelegramTransactionMessageParser.name);

  constructor(
    @Inject(TELEGRAM_DETERMINISTIC_TRANSACTION_MESSAGE_PARSER)
    private readonly deterministicParser: TransactionMessageParser,

    private readonly aiTransactionMessageParser: AITransactionMessageParser,
  ) {}

  async parse(
    input: TransactionMessageInput,
  ): Promise<ParsedTransactionMessage> {
    const deterministicResult = await this.deterministicParser.parse(input);

    if (deterministicResult.status === 'PARSED') {
      return deterministicResult;
    }

    if (deterministicResult.status === 'INVALID') {
      return deterministicResult;
    }

    this.logger.debug(
      `Deterministic parser could not parse Telegram message, trying AI: messageId=${input.messageId.toString()}`,
    );

    return this.aiTransactionMessageParser.parse(input);
  }
}
