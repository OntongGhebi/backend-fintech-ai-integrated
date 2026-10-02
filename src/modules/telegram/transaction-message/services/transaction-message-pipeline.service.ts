import { Inject, Injectable, Logger } from '@nestjs/common';

import { TELEGRAM_TRANSACTION_MESSAGE_PARSER } from '../../telegram.tokens';

import type {
  ParsedTransactionMessage,
  TransactionMessageInput,
  TransactionMessageParser,
} from '../types/transaction-message.types';

@Injectable()
export class TransactionMessagePipelineService {
  private readonly logger = new Logger(TransactionMessagePipelineService.name);

  constructor(
    @Inject(TELEGRAM_TRANSACTION_MESSAGE_PARSER)
    private readonly transactionMessageParser: TransactionMessageParser,
  ) {}

  async process(
    input: TransactionMessageInput,
  ): Promise<ParsedTransactionMessage> {
    const result = await this.transactionMessageParser.parse(input);

    switch (result.status) {
      case 'INVALID':
        this.logger.debug(
          `Invalid Telegram transaction message: messageId=${input.messageId.toString()}`,
        );
        break;

      case 'UNSUPPORTED':
        this.logger.debug(
          `Unsupported Telegram transaction message: messageId=${input.messageId.toString()}`,
        );
        break;

      case 'PARSED':
        this.logger.debug(
          `Telegram transaction message parsed: messageId=${input.messageId.toString()}`,
        );
        break;
    }

    return result;
  }
}
