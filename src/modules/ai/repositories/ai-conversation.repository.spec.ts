import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { AIMessageRole } from '../../../../generated/prisma/enums';

import { AIConversationRepository } from './ai-conversation.repository';

describe('AIConversationRepository', () => {
  let repository: AIConversationRepository;

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
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );

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

  describe('createConversation', () => {
    it('should create a conversation', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: 'Test conversation',
      };

      prismaMock.aIConversation.create.mockResolvedValue(conversation);

      await expect(
        repository.createConversation('user-id', 'Test conversation'),
      ).resolves.toEqual(conversation);

      expect(prismaMock.aIConversation.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id',
          title: 'Test conversation',
        },
      });
    });

    it('should normalize an empty title to null', async () => {
      prismaMock.aIConversation.create.mockResolvedValue({
        id: 'conversation-id',
      });

      await repository.createConversation('user-id', '   ');

      expect(prismaMock.aIConversation.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id',
          title: null,
        },
      });
    });
  });

  describe('findConversationByIdAndUserId', () => {
    it('should query by conversation and user ownership', async () => {
      prismaMock.aIConversation.findFirst.mockResolvedValue({
        id: 'conversation-id',
        userId: 'user-id',
      });

      await repository.findConversationByIdAndUserId(
        'conversation-id',
        'user-id',
      );

      expect(prismaMock.aIConversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'conversation-id',
          userId: 'user-id',
        },
      });
    });
  });

  describe('findConversationWithMessagesByIdAndUserId', () => {
    it('should return conversation with messages ordered by creation time', async () => {
      prismaMock.aIConversation.findFirst.mockResolvedValue({
        id: 'conversation-id',
        userId: 'user-id',
        messages: [],
      });

      await repository.findConversationWithMessagesByIdAndUserId(
        'conversation-id',
        'user-id',
      );

      expect(prismaMock.aIConversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'conversation-id',
          userId: 'user-id',
        },
        include: {
          messages: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });
    });
  });

  describe('findManyConversationsByUserId', () => {
    it('should return conversations ordered by latest update', async () => {
      prismaMock.aIConversation.findMany.mockResolvedValue([]);

      await repository.findManyConversationsByUserId('user-id');

      expect(prismaMock.aIConversation.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-id',
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
    });
  });

  describe('updateConversationTitle', () => {
    it('should update only an owned conversation', async () => {
      prismaMock.aIConversation.updateMany.mockResolvedValue({
        count: 1,
      });

      await repository.updateConversationTitle(
        'conversation-id',
        'user-id',
        'Updated title',
      );

      expect(prismaMock.aIConversation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'conversation-id',
          userId: 'user-id',
        },
        data: {
          title: 'Updated title',
        },
      });
    });
  });

  describe('createMessage', () => {
    const message = {
      id: 'message-id',
      conversationId: 'conversation-id',
      role: AIMessageRole.USER,
      content: 'Hello',
      model: null,
    };

    it('should create a message and update the conversation timestamp atomically', async () => {
      prismaMock.aIMessage.create.mockResolvedValue(message);
      prismaMock.aIConversation.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        repository.createMessage(
          'conversation-id',
          AIMessageRole.USER,
          'Hello',
        ),
      ).resolves.toEqual(message);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      expect(prismaMock.aIMessage.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conversation-id',
          role: AIMessageRole.USER,
          content: 'Hello',
          model: null,
        },
      });

      expect(prismaMock.aIConversation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'conversation-id',
        },
        data: {
          updatedAt: expect.any(Date),
        },
      });

      expect(
        prismaMock.aIMessage.create.mock.invocationCallOrder[0],
      ).toBeLessThan(
        prismaMock.aIConversation.updateMany.mock.invocationCallOrder[0],
      );
    });

    it('should normalize the model to null when it is not supplied', async () => {
      prismaMock.aIMessage.create.mockResolvedValue(message);
      prismaMock.aIConversation.updateMany.mockResolvedValue({
        count: 1,
      });

      await repository.createMessage(
        'conversation-id',
        AIMessageRole.USER,
        'Hello',
      );

      expect(prismaMock.aIMessage.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conversation-id',
          role: AIMessageRole.USER,
          content: 'Hello',
          model: null,
        },
      });
    });

    it('should preserve the normalized model name', async () => {
      prismaMock.aIMessage.create.mockResolvedValue({
        ...message,
        model: 'test-model',
      });
      prismaMock.aIConversation.updateMany.mockResolvedValue({
        count: 1,
      });

      await repository.createMessage(
        'conversation-id',
        AIMessageRole.ASSISTANT,
        'Hello',
        ' test-model ',
      );

      expect(prismaMock.aIMessage.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conversation-id',
          role: AIMessageRole.ASSISTANT,
          content: 'Hello',
          model: 'test-model',
        },
      });
    });

    it('should reject and roll back if the conversation update affects no rows', async () => {
      prismaMock.aIMessage.create.mockResolvedValue(message);
      prismaMock.aIConversation.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        repository.createMessage(
          'conversation-id',
          AIMessageRole.USER,
          'Hello',
        ),
      ).rejects.toThrow('AI conversation not found');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.aIMessage.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.aIConversation.updateMany).toHaveBeenCalledTimes(1);
    });

    it('should propagate an error if message creation fails', async () => {
      prismaMock.aIMessage.create.mockRejectedValue(
        new Error('Message creation failed'),
      );

      await expect(
        repository.createMessage(
          'conversation-id',
          AIMessageRole.USER,
          'Hello',
        ),
      ).rejects.toThrow('Message creation failed');

      expect(prismaMock.aIConversation.updateMany).not.toHaveBeenCalled();
    });

    it('should propagate an error if updating the conversation fails', async () => {
      prismaMock.aIMessage.create.mockResolvedValue(message);
      prismaMock.aIConversation.updateMany.mockRejectedValue(
        new Error('Conversation update failed'),
      );

      await expect(
        repository.createMessage(
          'conversation-id',
          AIMessageRole.USER,
          'Hello',
        ),
      ).rejects.toThrow('Conversation update failed');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.aIMessage.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.aIConversation.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findMessagesByConversationId', () => {
    it('should return messages in chronological order', async () => {
      prismaMock.aIMessage.findMany.mockResolvedValue([]);

      await repository.findMessagesByConversationId('conversation-id');

      expect(prismaMock.aIMessage.findMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conversation-id',
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });
  });

  describe('deleteConversation', () => {
    it('should delete only an owned conversation', async () => {
      prismaMock.aIConversation.deleteMany.mockResolvedValue({
        count: 1,
      });

      await repository.deleteConversation('conversation-id', 'user-id');

      expect(prismaMock.aIConversation.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'conversation-id',
          userId: 'user-id',
        },
      });
    });
  });
});
