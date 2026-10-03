import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { AI_PROVIDER } from '../constants/ai.constants';
import { AIService } from './ai.service';
import { AIProvider } from '../providers/ai-provider.interface';

describe('AIService', () => {
  let service: AIService;

  const provider: jest.Mocked<AIProvider> = {
    getMetadata: jest.fn(),
    complete: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
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

  describe('getProviderMetadata', () => {
    it('should return provider metadata', () => {
      const metadata = {
        provider: 'openai-compatible',
        model: 'test-model',
      };

      provider.getMetadata.mockReturnValue(metadata);

      expect(service.getProviderMetadata()).toEqual(metadata);
      expect(provider.getMetadata).toHaveBeenCalledTimes(1);
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

    it('should reject when AI is disabled', async () => {
      configService.get.mockReturnValue(false);

      await expect(service.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(provider.complete).not.toHaveBeenCalled();
    });

    it('should delegate completion to provider', async () => {
      configService.get.mockReturnValue(true);

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

      provider.complete.mockResolvedValue(response);

      await expect(service.complete(request)).resolves.toEqual(response);

      expect(provider.complete).toHaveBeenCalledWith(request);
    });

    it('should preserve ServiceUnavailableException from provider', async () => {
      configService.get.mockReturnValue(true);

      const error = new ServiceUnavailableException('Provider unavailable');

      provider.complete.mockRejectedValue(error);

      await expect(service.complete(request)).rejects.toBe(error);
    });

    it('should normalize unexpected provider errors', async () => {
      configService.get.mockReturnValue(true);

      provider.complete.mockRejectedValue(new Error('Connection refused'));

      await expect(service.complete(request)).rejects.toMatchObject({
        constructor: ServiceUnavailableException,
        message: 'AI service is currently unavailable',
      });
    });

    it('should normalize string provider errors', async () => {
      configService.get.mockReturnValue(true);

      provider.complete.mockRejectedValue('provider failure');

      await expect(service.complete(request)).rejects.toMatchObject({
        constructor: ServiceUnavailableException,
        message: 'AI service is currently unavailable',
      });
    });
  });
});
