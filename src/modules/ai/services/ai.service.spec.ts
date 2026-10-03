import { ServiceUnavailableException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Test, TestingModule } from '@nestjs/testing';

import { AI_PROVIDER } from '../constants/ai.constants';

import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';

import { AIProvider } from '../providers/ai-provider.interface';

import { AIRetryService } from './ai-retry.service';

import { AIService } from './ai.service';

import { AIUsageService } from './ai-usage.service';

describe('AIService', () => {
  let service: AIService;

  const provider: jest.Mocked<AIProvider> = {
    getMetadata: jest.fn(),
    complete: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  const aiRetryService = {
    execute: jest.fn(),
  };

  const aiUsageService = {
    recordCompletion: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,

        {
          provide: ConfigService,
          useValue: configService,
        },

        {
          provide: AI_PROVIDER,
          useValue: provider,
        },

        {
          provide: AIRetryService,
          useValue: aiRetryService,
        },

        {
          provide: AIUsageService,
          useValue: aiUsageService,
        },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
  });

  describe('isEnabled', () => {
    it('should return true when AI is enabled', () => {
      configService.get.mockReturnValue(true);

      expect(service.isEnabled()).toBe(true);

      expect(configService.get).toHaveBeenCalledWith('ai.enabled', false);
    });

    it('should return false when AI is disabled', () => {
      configService.get.mockReturnValue(false);

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return provider metadata', () => {
      const metadata = {
        provider: 'openai-compatible',
        model: 'test-model',
      };

      provider.getMetadata.mockReturnValue(metadata);

      expect(service.getMetadata()).toEqual(metadata);
    });
  });

  describe('complete', () => {
    const request = {
      messages: [
        {
          role: 'user' as const,
          content: 'Hello',
        },
      ],
      temperature: 0.2,
    };

    const response = {
      content: 'Hello!',
      provider: 'openai-compatible',
      model: 'test-model',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    };

    it('should reject when AI is disabled', async () => {
      configService.get.mockReturnValue(false);

      await expect(service.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(aiRetryService.execute).not.toHaveBeenCalled();

      expect(aiUsageService.recordCompletion).not.toHaveBeenCalled();
    });

    it('should execute provider through retry service', async () => {
      configService.get.mockReturnValue(true);

      aiRetryService.execute.mockImplementation(
        async (operation: () => Promise<unknown>) => operation(),
      );

      provider.complete.mockResolvedValue(response);

      await expect(service.complete(request)).resolves.toEqual(response);

      expect(aiRetryService.execute).toHaveBeenCalledTimes(1);

      expect(provider.complete).toHaveBeenCalledWith(request);

      expect(aiUsageService.recordCompletion).not.toHaveBeenCalled();
    });

    it('should record usage after a successful user completion', async () => {
      configService.get.mockReturnValue(true);

      aiRetryService.execute.mockResolvedValue(response);

      aiUsageService.recordCompletion.mockResolvedValue({
        id: 'usage-id',
      });

      await expect(
        service.complete(request, {
          userId: 'user-id',
          feature: AI_USAGE_FEATURES.CHAT,
        }),
      ).resolves.toEqual(response);

      expect(aiUsageService.recordCompletion).toHaveBeenCalledTimes(1);

      expect(aiUsageService.recordCompletion).toHaveBeenCalledWith(
        'user-id',
        response,
        AI_USAGE_FEATURES.CHAT,
      );
    });

    it('should use CHAT as the default feature', async () => {
      configService.get.mockReturnValue(true);

      aiRetryService.execute.mockResolvedValue(response);

      await service.complete(request, {
        userId: 'user-id',
      });

      expect(aiUsageService.recordCompletion).toHaveBeenCalledWith(
        'user-id',
        response,
        AI_USAGE_FEATURES.CHAT,
      );
    });

    it('should not record usage for provider failure', async () => {
      configService.get.mockReturnValue(true);

      const error = new ServiceUnavailableException('Provider unavailable');

      aiRetryService.execute.mockRejectedValue(error);

      await expect(
        service.complete(request, {
          userId: 'user-id',
        }),
      ).rejects.toBe(error);

      expect(aiUsageService.recordCompletion).not.toHaveBeenCalled();
    });

    it('should normalize unexpected retry errors', async () => {
      configService.get.mockReturnValue(true);

      aiRetryService.execute.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.complete(request, {
          userId: 'user-id',
        }),
      ).rejects.toMatchObject({
        constructor: ServiceUnavailableException,
        message: 'AI service is currently unavailable',
      });

      expect(aiUsageService.recordCompletion).not.toHaveBeenCalled();
    });

    it('should continue returning completion when usage persistence fails', async () => {
      configService.get.mockReturnValue(true);

      aiRetryService.execute.mockResolvedValue(response);

      aiUsageService.recordCompletion.mockResolvedValue(null);

      await expect(
        service.complete(request, {
          userId: 'user-id',
        }),
      ).resolves.toEqual(response);

      expect(aiUsageService.recordCompletion).toHaveBeenCalledWith(
        'user-id',
        response,
        AI_USAGE_FEATURES.CHAT,
      );
    });
  });
});
