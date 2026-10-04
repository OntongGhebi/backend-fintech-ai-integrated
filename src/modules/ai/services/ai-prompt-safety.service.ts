import { Injectable } from '@nestjs/common';

import {
  AI_MAX_SYSTEM_INSTRUCTION_LENGTH,
  AI_MAX_USER_INPUT_LENGTH,
  AI_SENSITIVE_INSTRUCTION_PATTERNS,
} from '../constants/ai-safety.constants';

import type { AISafetyValidationResult } from '../types/ai-safety.types';

@Injectable()
export class AIPromptSafetyService {
  validateUserInput(input: string): AISafetyValidationResult {
    if (typeof input !== 'string') {
      return {
        status: 'REJECTED',
        reason: 'AI user input must be a string',
      };
    }

    const normalizedText = this.normalizeUserInput(input);

    if (!normalizedText) {
      return {
        status: 'REJECTED',
        reason: 'AI user input cannot be empty',
      };
    }

    if (normalizedText.length > AI_MAX_USER_INPUT_LENGTH) {
      return {
        status: 'REJECTED',
        reason: 'AI user input exceeds the maximum allowed length',
      };
    }

    if (this.containsSensitiveInstruction(normalizedText)) {
      return {
        status: 'REJECTED',
        reason: 'AI user input contains an unsupported instruction override',
      };
    }

    return {
      status: 'SAFE',
      normalizedText,
    };
  }

  validateSystemInstruction(instruction: string): AISafetyValidationResult {
    if (typeof instruction !== 'string') {
      return {
        status: 'REJECTED',
        reason: 'AI system instruction must be a string',
      };
    }

    const normalizedInstruction = instruction.trim();

    if (!normalizedInstruction) {
      return {
        status: 'REJECTED',
        reason: 'AI system instruction cannot be empty',
      };
    }

    if (normalizedInstruction.length > AI_MAX_SYSTEM_INSTRUCTION_LENGTH) {
      return {
        status: 'REJECTED',
        reason: 'AI system instruction exceeds the maximum allowed length',
      };
    }

    return {
      status: 'SAFE',
      normalizedText: normalizedInstruction,
    };
  }

  normalizeUserInput(input: string): string {
    return input
      .normalize('NFKC')
      .split(String.fromCharCode(0))
      .join('')
      .trim()
      .replace(/\s+/g, ' ');
  }

  containsSensitiveInstruction(input: string): boolean {
    return AI_SENSITIVE_INSTRUCTION_PATTERNS.some((pattern) =>
      pattern.test(input),
    );
  }
}
