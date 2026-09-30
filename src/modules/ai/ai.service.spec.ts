import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AI_PROVIDER } from './ai.constants';
import { AIService } from './ai.service';
import { AIProvider } from './ai-provider.interface';

describe('AIService', () => {
  let service: AIService;

  const configServiceMock = {
    get: jest.fn(),
  };

  const providerMock: AIProvider = {
    getMetadata: jest.fn(),
    complete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: AI_PROVIDER,
          useValue: providerMock,
        },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
  });

  describe('isEnabled', () => {
    it('should return true when AI is enabled', () => {
      configServiceMock.get.mockReturnValue(true);

      expect(service.isEnabled()).toBe(true);

      expect(configServiceMock.get).toHaveBeenCalledWith('ai.enabled', false);
    });

    it('should return false when AI is disabled', () => {
      configServiceMock.get.mockReturnValue(false);

      expect(service.isEnabled()).toBe(false);

      expect(configServiceMock.get).toHaveBeenCalledWith('ai.enabled', false);
    });
  });

  describe('getProviderMetadata', () => {
    it('should return provider metadata', () => {
      const metadata = {
        provider: 'test-provider',
        model: 'test-model',
      };

      providerMock.getMetadata.mockReturnValue(metadata);

      expect(service.getProviderMetadata()).toEqual(metadata);

      expect(providerMock.getMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe('complete', () => {
    const request = {
      messages: [
        {
          role: 'user' as const,
          content: 'test message',
        },
      ],
    };

    it('should reject when AI is disabled', async () => {
      configServiceMock.get.mockReturnValue(false);

      await expect(service.complete(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(providerMock.complete).not.toHaveBeenCalled();
    });

    it('should delegate to the configured provider', async () => {
      configServiceMock.get.mockReturnValue(true);

      const response = {
        content: 'test response',
        provider: 'test-provider',
        model: 'test-model',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      };

      providerMock.complete.mockResolvedValue(response);

      await expect(service.complete(request)).resolves.toEqual(response);

      expect(providerMock.complete).toHaveBeenCalledTimes(1);

      expect(providerMock.complete).toHaveBeenCalledWith(request);
    });

    it('should propagate provider errors', async () => {
      configServiceMock.get.mockReturnValue(true);

      const error = new Error('AI provider request failed');

      providerMock.complete.mockRejectedValue(error);

      await expect(service.complete(request)).rejects.toThrow(
        'AI provider request failed',
      );
    });
  });
});
