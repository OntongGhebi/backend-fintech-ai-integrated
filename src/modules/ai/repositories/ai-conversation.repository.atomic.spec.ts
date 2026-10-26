import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AIMessageRole } from '../../../../generated/prisma/enums';
import { AIConversationRepository } from './ai-conversation.repository';

describe('AIConversationRepository atomic assistant persistence', () => {
  let repository: AIConversationRepository;

  const transactionMock = {
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
    aIConversation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    aIMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionMock) => Promise<unknown>) =>
        callback(transactionMock),
    );

    transactionMock.aIMessage.create.mockResolvedValue({
      id: 'assistant-message-id',
      conversationId: 'conversation-id',
      role: AIMessageRole.ASSISTANT,
      content: 'Jawaban AI',
      model: 'test-model',
      createdAt: new Date('2026-10-26T08:00:00.000Z'),
    });

    transactionMock.aIConversation.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionMock.$executeRaw.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIConversationRepository,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    repository = module.get<AIConversationRepository>(AIConversationRepository);
  });

  const input = {
    requestId: 'request-id',
    conversationId: 'conversation-id',
    content: 'Jawaban AI',
    model: 'test-model',
    provider: 'openai-compatible',
    usage: {
      inputTokens: 10,
      outputTokens: 12,
      totalTokens: 22,
    },
  };

  describe('successful completion', () => {
    it('should execute all persistence operations inside one transaction', async () => {
      await repository.createIdempotentAssistantMessageAndCompleteRequest(
        input as Parameters<
          AIConversationRepository['createIdempotentAssistantMessageAndCompleteRequest']
        >[0],
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      expect(transactionMock.aIMessage.create).toHaveBeenCalledWith({
        data: {
          conversationId: input.conversationId,
          role: AIMessageRole.ASSISTANT,
          content: input.content,
          model: input.model,
        },
      });

      expect(transactionMock.aIConversation.updateMany).toHaveBeenCalledWith({
        where: {
          id: input.conversationId,
        },
        data: {
          updatedAt: expect.any(Date),
        },
      });

      expect(transactionMock.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should preserve the assistant response payload', async () => {
      const result =
        await repository.createIdempotentAssistantMessageAndCompleteRequest(
          input as Parameters<
            AIConversationRepository['createIdempotentAssistantMessageAndCompleteRequest']
          >[0],
        );

      expect(result).toMatchObject({
        conversationId: input.conversationId,
        provider: input.provider,
        model: input.model,
        usage: input.usage,
        message: {
          id: 'assistant-message-id',
          role: AIMessageRole.ASSISTANT,
          content: input.content,
        },
      });
    });

    it('should not use a separate transaction for request completion', async () => {
      await repository.createIdempotentAssistantMessageAndCompleteRequest(
        input as Parameters<
          AIConversationRepository['createIdempotentAssistantMessageAndCompleteRequest']
        >[0],
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('request completion failure', () => {
    it('should reject when the request is no longer processing', async () => {
      transactionMock.$executeRaw.mockResolvedValueOnce(0);

      await expect(
        repository.createIdempotentAssistantMessageAndCompleteRequest(
          input as Parameters<
            AIConversationRepository['createIdempotentAssistantMessageAndCompleteRequest']
          >[0],
        ),
      ).rejects.toThrow();

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.aIMessage.create).toHaveBeenCalledTimes(1);
      expect(transactionMock.aIConversation.updateMany).toHaveBeenCalledTimes(
        1,
      );
      expect(transactionMock.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should propagate a database error during request completion', async () => {
      const databaseError = new Error('Failed to complete idempotency request');

      transactionMock.$executeRaw.mockRejectedValueOnce(databaseError);

      await expect(
        repository.createIdempotentAssistantMessageAndCompleteRequest(
          input as Parameters<
            AIConversationRepository['createIdempotentAssistantMessageAndCompleteRequest']
          >[0],
        ),
      ).rejects.toBe(databaseError);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('conversation update failure', () => {
    it('should reject if the conversation update affects no rows', async () => {
      transactionMock.aIConversation.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(
        repository.createIdempotentAssistantMessageAndCompleteRequest(
          input as Parameters<
            AIConversationRepository['createIdempotentAssistantMessageAndCompleteRequest']
          >[0],
        ),
      ).rejects.toThrow();

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.aIMessage.create).toHaveBeenCalledTimes(1);
      expect(transactionMock.aIConversation.updateMany).toHaveBeenCalledTimes(
        1,
      );
      expect(transactionMock.$executeRaw).not.toHaveBeenCalled();
    });
  });
});
