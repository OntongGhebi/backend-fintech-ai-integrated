import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_PROVIDER } from './ai.constants';
import { AIService } from './ai.service';
import { AIConversationService } from './ai-conversation.service';
import { AIProvider } from './providers/ai-provider.interface';

import { OpenAICompatibleAIProvider } from './providers/openai-compatible-ai.provider';
import { UnavailableAIProvider } from './providers/unavailable-ai.provider';

import { AIConversationRepository } from './repositories/ai-conversation.repository';
import { AIChatService } from './ai-chat.service';
import { AIIntentClassifierService } from './ai-intent-classifier.service';

@Module({
  providers: [
    AIService,
    AIChatService,
    AIConversationService,
    AIIntentClassifierService,
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
    AIConversationRepository,
    AI_PROVIDER,
  ],
})
export class AIModule {}
