import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_PROVIDER } from './constants/ai.constants';
import { AIService } from './services/ai.service';
import { AIConversationService } from './services/ai-conversation.service';
import { AIProvider } from './providers/ai-provider.interface';

import { OpenAICompatibleAIProvider } from './providers/openai-compatible-ai.provider';
import { UnavailableAIProvider } from './providers/unavailable-ai.provider';

import { AIConversationRepository } from './repositories/ai-conversation.repository';
import { AIChatService } from './services/ai-chat.service';
import { AIIntentClassifierService } from './services/ai-intent-classifier.service';
import { AITransactionEntityExtractorService } from './services/ai-transaction-entity-extractor.service';
import { AITransactionResolutionService } from './services/ai-transaction-resolution.service';
import { AITransactionDraftService } from './services/ai-transaction-draft.service';
import { AITransactionConfirmationService } from './services/ai-transaction-confirmation.service';
import { AITransactionPersistenceService } from './services/ai-transaction-persistence.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule, TransactionsModule],
  providers: [
    AIService,
    AIChatService,
    AIConversationService,
    AIIntentClassifierService,
    AITransactionEntityExtractorService,
    AITransactionResolutionService,
    AITransactionDraftService,
    AITransactionConfirmationService,
    AITransactionPersistenceService,
    AIConversationRepository,

    OpenAICompatibleAIProvider,
    UnavailableAIProvider,

    {
      provide: AI_PROVIDER,
      inject: [
        ConfigService,
        OpenAICompatibleAIProvider,
        UnavailableAIProvider,
      ],
      useFactory: (
        configService: ConfigService,
        openAICompatibleProvider: OpenAICompatibleAIProvider,
        unavailableProvider: UnavailableAIProvider,
      ): AIProvider => {
        const provider = configService.get<string>('ai.provider', 'none');

        switch (provider) {
          case 'openai-compatible':
            return openAICompatibleProvider;

          case 'none':
          default:
            return unavailableProvider;
        }
      },
    },
  ],
  exports: [
    AIService,
    AIChatService,
    AIConversationService,
    AIIntentClassifierService,
    AITransactionEntityExtractorService,
    AITransactionResolutionService,
    AITransactionDraftService,
    AITransactionConfirmationService,
    AITransactionPersistenceService,
    AIConversationRepository,
    AI_PROVIDER,
  ],
})
export class AIModule {}
