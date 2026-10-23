import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_PROVIDER } from './constants/ai.constants';

import { AIService } from './services/ai.service';
import { AIChatService } from './services/ai-chat.service';
import { AIConversationService } from './services/ai-conversation.service';
import { AIConversationContextService } from './services/ai-conversation-context.service';

import { AIIntentClassifierService } from './services/ai-intent-classifier.service';
import { AITransactionEntityExtractorService } from './services/ai-transaction-entity-extractor.service';
import { AITransactionResolutionService } from './services/ai-transaction-resolution.service';
import { AITransactionDraftService } from './services/ai-transaction-draft.service';
import { AITransactionConfirmationService } from './services/ai-transaction-confirmation.service';
import { AITransactionPersistenceService } from './services/ai-transaction-persistence.service';
import { AITransactionIntelligenceService } from './services/ai-transaction-intelligence.service';
import { AITransactionValidationService } from './services/ai-transaction-validation.service';

import { AIRetryService } from './services/ai-retry.service';
import { AIUsageService } from './services/ai-usage.service';

import { AIPromptSafetyService } from './services/ai-prompt-safety.service';
import { AIPromptBuilderService } from './services/ai-prompt-builder.service';

import { AIConversationRepository } from './repositories/ai-conversation.repository';
import { AIUsageRepository } from './repositories/ai-usage.repository';

import { OpenAICompatibleAIProvider } from './providers/openai-compatible-ai.provider';
import { UnavailableAIProvider } from './providers/unavailable-ai.provider';
import { AIProvider } from './providers/ai-provider.interface';

import { TransactionsModule } from '../transactions/transactions.module';
import { DatabaseModule } from 'src/database/database.module';
import { AIPrivacyService } from './services/ai-privacy.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => TransactionsModule)],
  providers: [
    AIService,
    AIChatService,
    AIConversationService,
    AIConversationContextService,
    AIPrivacyService,

    AIRetryService,
    AIUsageService,

    AIIntentClassifierService,
    AITransactionEntityExtractorService,
    AITransactionResolutionService,
    AITransactionDraftService,
    AITransactionConfirmationService,
    AITransactionPersistenceService,
    AITransactionIntelligenceService,
    AITransactionValidationService,

    AIPromptSafetyService,
    AIPromptBuilderService,

    AIConversationRepository,
    AIUsageRepository,

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
    AIConversationContextService,
    AIPrivacyService,

    AIRetryService,
    AIUsageService,

    AIIntentClassifierService,
    AITransactionEntityExtractorService,
    AITransactionResolutionService,
    AITransactionDraftService,
    AITransactionConfirmationService,
    AITransactionPersistenceService,
    AITransactionIntelligenceService,
    AITransactionValidationService,

    AIPromptSafetyService,
    AIPromptBuilderService,

    AIConversationRepository,
    AIUsageRepository,
    AI_PROVIDER,
  ],
})
export class AIModule {}
