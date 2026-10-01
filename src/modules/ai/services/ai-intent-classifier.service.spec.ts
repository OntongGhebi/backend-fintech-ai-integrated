import { ServiceUnavailableException } from '@nestjs/common';

import { AIService } from './ai.service';
import { AIIntentClassifierService } from './ai-intent-classifier.service';

describe('AIIntentClassifierService', () => {
  let service: AIIntentClassifierService;

  let aiService: {
    complete: jest.Mock;
  };

  beforeEach(() => {
    aiService = {
      complete: jest.fn(),
    };

    service = new AIIntentClassifierService(aiService as unknown as AIService);
  });

  describe('classify', () => {
    it('should classify a create transaction intent', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'CREATE_TRANSACTION',
          confidence: 0.97,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.classify('tadi makan di kfc 45000');

      expect(result).toEqual({
        intent: 'CREATE_TRANSACTION',
        confidence: 0.97,
      });

      expect(aiService.complete).toHaveBeenCalledTimes(1);

      expect(aiService.complete.mock.calls[0][0]).toMatchObject({
        temperature: 0,
        responseFormat: 'json',
      });
    });

    it('should classify a balance query', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'QUERY_BALANCE',
          confidence: 0.94,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.classify('berapa saldo rekening saya?');

      expect(result).toEqual({
        intent: 'QUERY_BALANCE',
        confidence: 0.94,
      });
    });

    it('should classify a transaction query', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'QUERY_TRANSACTIONS',
          confidence: 0.91,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.classify(
        'tampilkan transaksi saya minggu ini',
      );

      expect(result).toEqual({
        intent: 'QUERY_TRANSACTIONS',
        confidence: 0.91,
      });
    });

    it('should classify a budget query', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'QUERY_BUDGET',
          confidence: 0.93,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.classify(
        'berapa penggunaan budget makan bulan ini?',
      );

      expect(result).toEqual({
        intent: 'QUERY_BUDGET',
        confidence: 0.93,
      });
    });

    it('should classify general conversation', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'GENERAL_CHAT',
          confidence: 0.88,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.classify('halo, apa kabar?');

      expect(result).toEqual({
        intent: 'GENERAL_CHAT',
        confidence: 0.88,
      });
    });

    it('should classify unknown input', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'UNKNOWN',
          confidence: 0.42,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.classify('asdfgh');

      expect(result).toEqual({
        intent: 'UNKNOWN',
        confidence: 0.42,
      });
    });

    it('should trim the user content before sending it to the provider', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'CREATE_TRANSACTION',
          confidence: 0.95,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await service.classify('   beli kopi 20000   ');

      expect(aiService.complete.mock.calls[0][0].messages[1]).toEqual({
        role: 'user',
        content: 'beli kopi 20000',
      });
    });

    it('should reject empty content', async () => {
      await expect(service.classify('   ')).rejects.toThrow(
        'AI intent classification content cannot be empty',
      );

      expect(aiService.complete).not.toHaveBeenCalled();
    });

    it('should reject invalid JSON', async () => {
      aiService.complete.mockResolvedValue({
        content: 'The intent is CREATE_TRANSACTION',
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.classify('beli kopi 20000')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should reject a non-object JSON response', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify(['CREATE_TRANSACTION', 0.9]),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.classify('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an invalid intent classification structure',
      );
    });

    it('should reject an unsupported intent', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'DELETE_ACCOUNT',
          confidence: 0.99,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.classify('hapus rekening saya')).rejects.toThrow(
        'AI provider returned an unsupported intent',
      );
    });

    it('should reject a non-string intent', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 123,
          confidence: 0.99,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.classify('test')).rejects.toThrow(
        'AI provider returned an unsupported intent',
      );
    });

    it('should reject confidence below zero', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'CREATE_TRANSACTION',
          confidence: -0.1,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.classify('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an invalid intent confidence',
      );
    });

    it('should reject confidence above one', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'CREATE_TRANSACTION',
          confidence: 1.1,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.classify('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an invalid intent confidence',
      );
    });

    it('should reject a non-numeric confidence', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          intent: 'CREATE_TRANSACTION',
          confidence: 'high',
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.classify('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an invalid intent confidence',
      );
    });

    it('should propagate AI provider errors', async () => {
      aiService.complete.mockRejectedValue(
        new ServiceUnavailableException('AI provider request failed'),
      );

      await expect(service.classify('beli kopi 20000')).rejects.toThrow(
        'AI provider request failed',
      );
    });
  });
});
