import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AIPromptSafetyService } from './ai-prompt-safety.service';

import type { AIMessage } from '../types/ai.types';

export interface AIPromptBuildInput {
  systemInstruction: string;
  userContent: string;
}

@Injectable()
export class AIPromptBuilderService {
  constructor(private readonly aiPromptSafetyService: AIPromptSafetyService) {}

  build(input: AIPromptBuildInput): AIMessage[] {
    const systemValidation =
      this.aiPromptSafetyService.validateSystemInstruction(
        input.systemInstruction,
      );

    if (
      systemValidation.status !== 'SAFE' ||
      !systemValidation.normalizedText
    ) {
      throw new ServiceUnavailableException(
        systemValidation.reason ?? 'AI system instruction is invalid',
      );
    }

    const userValidation = this.aiPromptSafetyService.validateUserInput(
      input.userContent,
    );

    if (userValidation.status !== 'SAFE' || !userValidation.normalizedText) {
      throw new ServiceUnavailableException(
        userValidation.reason ?? 'AI user input is unsafe',
      );
    }

    return [
      {
        role: 'system',
        content: systemValidation.normalizedText,
      },
      {
        role: 'user',
        content: this.wrapUserContent(userValidation.normalizedText),
      },
    ];
  }

  private wrapUserContent(content: string): string {
    return ['<user_input>', content, '</user_input>'].join('\n');
  }
}
