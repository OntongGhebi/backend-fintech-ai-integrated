import { AIConversationRepository } from './ai-conversation.repository';
import { PrismaService } from '../../../database/prisma/prisma.service';

describe('AIConversationRepository assistant idempotency', () => {
  let repository: AIConversationRepository;

  const assistantMessage = {
    id: 'assistant-message-id',
    conversationId: '22222222-2222-4222-8222-222222222222',
    role: 'ASSISTANT',
    content: 'Ringkasan pengeluaran Anda.',
    model: 'test-model',
    createdAt: new Date('2026-10-26T08:00:00.000Z'),
  };

  const txMock = {
    aIMessage: {
      create: jest.fn(),
    },
    aIConversation: {
      updateMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };

  const prismaMock = {
    $transaction: jest.fn(),
  };

  const input = {
    requestId: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    content: 'Ringkasan pengeluaran Anda.',
    model: 'test-model',
    provider: 'openai-compatible',
    usage: {
      inputTokens: 10,
      outputTokens: 12,
      totalTokens: 22,
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();

    txMock.aIMessage.create.mockResolvedValue(assistantMessage);
    txMock.aIConversation.updateMany.mockResolvedValue({ count: 1 });
    txMock.$executeRaw.mockResolvedValue(1);

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    );

    repository = new AIConversationRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('createIdempotentAssistantMessageAndCompleteRequest', () => {
    it('should save the assistant message and complete the request in one transaction', async () => {
      const result =
        await repository.createIdempotentAssistantMessageAndCompleteRequest(
          input,
        );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      expect(txMock.aIMessage.create).toHaveBeenCalledWith({
        data: {
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: input.content,
          model: input.model,
        },
      });

      expect(txMock.aIConversation.updateMany).toHaveBeenCalledWith({
        where: {
          id: input.conversationId,
        },
        data: {
          updatedAt: expect.any(Date),
        },
      });

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        conversationId: input.conversationId,
        message: assistantMessage,
        provider: input.provider,
        model: input.model,
        usage: input.usage,
      });
    });

    it('should reject when the idempotency request is not processing', async () => {
      txMock.$executeRaw.mockResolvedValue(0);

      await expect(
        repository.createIdempotentAssistantMessageAndCompleteRequest(input),
      ).rejects.toThrow(
        'AI idempotency request could not be completed atomically',
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.aIMessage.create).toHaveBeenCalledTimes(1);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should reject when the conversation update fails', async () => {
      txMock.aIConversation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.createIdempotentAssistantMessageAndCompleteRequest(input),
      ).rejects.toThrow(
        'AI conversation could not be updated while saving the assistant response',
      );

      expect(txMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('should propagate an assistant message creation error', async () => {
      txMock.aIMessage.create.mockRejectedValueOnce(
        new Error('Assistant message creation failed'),
      );

      await expect(
        repository.createIdempotentAssistantMessageAndCompleteRequest(input),
      ).rejects.toThrow('Assistant message creation failed');

      expect(txMock.aIConversation.updateMany).not.toHaveBeenCalled();
      expect(txMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('should propagate an error when updating the idempotency request fails', async () => {
      txMock.$executeRaw.mockRejectedValueOnce(
        new Error('Idempotency update failed'),
      );

      await expect(
        repository.createIdempotentAssistantMessageAndCompleteRequest(input),
      ).rejects.toThrow('Idempotency update failed');
    });
  });
});
