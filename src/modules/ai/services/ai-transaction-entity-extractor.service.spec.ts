import { ServiceUnavailableException } from '@nestjs/common';

import { AIService } from './ai.service';
import { AITransactionEntityExtractorService } from './ai-transaction-entity-extractor.service';

describe('AITransactionEntityExtractorService', () => {
  let service: AITransactionEntityExtractorService;

  let aiService: {
    complete: jest.Mock;
  };

  beforeEach(() => {
    aiService = {
      complete: jest.fn(),
    };

    service = new AITransactionEntityExtractorService(
      aiService as unknown as AIService,
    );
  });

  describe('extract', () => {
    it('should extract an expense transaction', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 45000,
          description: 'makan di kfc',
          accountHint: 'bca',
          categoryHint: 'makanan',
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.extract('tadi makan di kfc 45000 pakai bca');

      expect(result).toEqual({
        type: 'EXPENSE',
        amount: 45000,
        description: 'makan di kfc',
        accountHint: 'bca',
        categoryHint: 'makanan',
        destinationAccountHint: null,
      });
    });

    it('should extract an income transaction', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'INCOME',
          amount: 7500000,
          description: 'gajian',
          accountHint: 'BCA',
          categoryHint: 'gaji',
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.extract('gajian masuk 7500000 ke BCA');

      expect(result).toEqual({
        type: 'INCOME',
        amount: 7500000,
        description: 'gajian',
        accountHint: 'BCA',
        categoryHint: 'gaji',
        destinationAccountHint: null,
      });
    });

    it('should extract a transfer transaction', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'TRANSFER',
          amount: 500000,
          description: 'transfer ke tabungan',
          accountHint: 'BCA',
          categoryHint: null,
          destinationAccountHint: 'Mandiri',
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.extract(
        'transfer 500000 dari BCA ke Mandiri',
      );

      expect(result).toEqual({
        type: 'TRANSFER',
        amount: 500000,
        description: 'transfer ke tabungan',
        accountHint: 'BCA',
        categoryHint: null,
        destinationAccountHint: 'Mandiri',
      });
    });

    it('should allow optional fields to be null', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 25000,
          description: null,
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.extract('25000');

      expect(result).toEqual({
        type: 'EXPENSE',
        amount: 25000,
        description: null,
        accountHint: null,
        categoryHint: null,
        destinationAccountHint: null,
      });
    });

    it('should trim the input before sending it to the provider', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 20000,
          description: 'kopi',
          accountHint: null,
          categoryHint: 'minuman',
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await service.extract('   beli kopi 20000   ');

      expect(aiService.complete.mock.calls[0][0].messages[1]).toEqual({
        role: 'user',
        content: 'beli kopi 20000',
      });
    });

    it('should use JSON response format', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 20000,
          description: 'kopi',
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await service.extract('beli kopi 20000');

      expect(aiService.complete.mock.calls[0][0]).toMatchObject({
        temperature: 0,
        responseFormat: 'json',
      });
    });

    it('should reject empty content', async () => {
      await expect(service.extract('   ')).rejects.toThrow(
        'AI transaction entity extraction content cannot be empty',
      );

      expect(aiService.complete).not.toHaveBeenCalled();
    });

    it('should reject invalid JSON', async () => {
      aiService.complete.mockResolvedValue({
        content: 'This is not valid JSON',
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('beli kopi 20000')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should reject a non-object response', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify(['EXPENSE', 20000]),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an invalid transaction entity structure',
      );
    });

    it('should reject an unsupported transaction type', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'REFUND',
          amount: 20000,
          description: 'refund',
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('refund 20000')).rejects.toThrow(
        'AI provider returned an unsupported transaction type',
      );
    });

    it('should reject a non-string transaction type', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 123,
          amount: 20000,
          description: 'kopi',
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an unsupported transaction type',
      );
    });

    it('should reject a zero amount', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 0,
          description: 'kopi',
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('kopi gratis')).rejects.toThrow(
        'AI provider returned an invalid transaction amount',
      );
    });

    it('should reject a negative amount', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: -20000,
          description: 'kopi',
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('kopi -20000')).rejects.toThrow(
        'AI provider returned an invalid transaction amount',
      );
    });

    it('should reject a non-numeric amount', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: '20000',
          description: 'kopi',
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an invalid transaction amount',
      );
    });

    it('should reject an invalid description', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 20000,
          description: 123,
          accountHint: null,
          categoryHint: null,
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(service.extract('beli kopi 20000')).rejects.toThrow(
        'AI provider returned an invalid description',
      );
    });

    it('should normalize empty optional strings to null', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 20000,
          description: '   ',
          accountHint: ' ',
          categoryHint: '',
          destinationAccountHint: null,
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      const result = await service.extract('beli kopi 20000');

      expect(result).toEqual({
        type: 'EXPENSE',
        amount: 20000,
        description: null,
        accountHint: null,
        categoryHint: null,
        destinationAccountHint: null,
      });
    });

    it('should reject destination account for non-transfer transaction', async () => {
      aiService.complete.mockResolvedValue({
        content: JSON.stringify({
          type: 'EXPENSE',
          amount: 20000,
          description: 'kopi',
          accountHint: 'BCA',
          categoryHint: 'makanan',
          destinationAccountHint: 'Mandiri',
        }),
        provider: 'openai-compatible',
        model: 'test-model',
      });

      await expect(
        service.extract('beli kopi 20000 dari BCA ke Mandiri'),
      ).rejects.toThrow(
        'AI provider returned a destination account for a non-transfer transaction',
      );
    });

    it('should propagate AI provider errors', async () => {
      aiService.complete.mockRejectedValue(
        new ServiceUnavailableException('AI provider request failed'),
      );

      await expect(service.extract('beli kopi 20000')).rejects.toThrow(
        'AI provider request failed',
      );
    });
  });
});
