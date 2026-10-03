import { Test, TestingModule } from '@nestjs/testing';
import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';
import { AIUsageRepository } from '../repositories/ai-usage.repository';
import { AIUsageService } from './ai-usage.service';

describe('AIUsageService', () => {
  let service: AIUsageService;

  const repository = {
    create: jest.fn(),
    findManyByUserId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIUsageService,
        {
          provide: AIUsageRepository,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<AIUsageService>(AIUsageService);
  });

  describe('recordCompletion', () => {
    const completion = {
      content: 'Hello',
      provider: 'openai-compatible',
      model: 'test-model',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
    };

    it('should persist AI completion usage', async () => {
      const usage = {
        id: 'usage-id',
        userId: 'user-id',
        feature: AI_USAGE_FEATURES.CHAT,
        provider: 'openai-compatible',
        model: 'test-model',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: null,
        createdAt: new Date(),
      };

      repository.create.mockResolvedValue(usage);

      await expect(
        service.recordCompletion('user-id', completion),
      ).resolves.toEqual(usage);

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-id',
        feature: AI_USAGE_FEATURES.CHAT,
        completion,
      });
    });

    it('should use the provided feature', async () => {
      repository.create.mockResolvedValue({
        id: 'usage-id',
      });

      await service.recordCompletion('user-id', completion, 'CUSTOM_FEATURE');

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-id',
        feature: 'CUSTOM_FEATURE',
        completion,
      });
    });

    it('should persist completion even when usage metadata is absent', async () => {
      const completionWithoutUsage = {
        content: 'Hello',
        provider: 'openai-compatible',
        model: 'test-model',
      };

      repository.create.mockResolvedValue({
        id: 'usage-id',
      });

      await service.recordCompletion('user-id', completionWithoutUsage);

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-id',
        feature: AI_USAGE_FEATURES.CHAT,
        completion: completionWithoutUsage,
      });
    });

    it('should not break AI completion when usage persistence fails', async () => {
      repository.create.mockRejectedValue(new Error('Database unavailable'));

      await expect(
        service.recordCompletion('user-id', completion),
      ).resolves.toBeNull();
    });
  });

  describe('findManyByUserId', () => {
    it('should delegate to repository', async () => {
      const usages = [
        {
          id: 'usage-1',
        },
      ];

      repository.findManyByUserId.mockResolvedValue(usages);

      await expect(
        service.findManyByUserId('user-id', {
          feature: AI_USAGE_FEATURES.CHAT,
          limit: 10,
        }),
      ).resolves.toEqual(usages);

      expect(repository.findManyByUserId).toHaveBeenCalledWith('user-id', {
        feature: AI_USAGE_FEATURES.CHAT,
        limit: 10,
      });
    });
  });
});
