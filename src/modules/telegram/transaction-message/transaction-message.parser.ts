import { Injectable } from '@nestjs/common';
import {
  ParsedTransactionMessage,
  TransactionMessageInput,
  TransactionMessageParser,
} from './transaction-message.types';

@Injectable()
export class BasicTransactionMessageParser implements TransactionMessageParser {
  async parse(
    input: TransactionMessageInput,
  ): Promise<ParsedTransactionMessage> {
    const text = input.text.trim();

    if (!text) {
      return {
        status: 'INVALID',
        rawText: input.text,
      };
    }

    return {
      status: 'UNSUPPORTED',
      rawText: input.text,
    };
  }
}
