import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { UnavailableAIProvider } from './providers/unavailable-ai.provider';
import { AI_PROVIDER } from './ai.constants';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    UnavailableAIProvider,
    {
      provide: AI_PROVIDER,
      useExisting: UnavailableAIProvider,
    },
  ],
  exports: [AiService, AI_PROVIDER],
})
export class AiModule {}
