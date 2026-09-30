import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AIMessageRole } from '../../../generated/prisma/client.js';

import { AIConversationService } from './ai-conversation.service';
import { AIConversationRepository } from './repositories/ai-conversation.repository';

describe('AIConversationService', () => {
  let service: AIConversationService;

  const repositoryMock = {
    createConversation: jest.fn(),
    findConversationByIdAndUserId: jest.fn(),
    findConversationWithMessagesByIdAndUserId: jest.fn(),
    findManyConversationsByUserId: jest.fn(),
    updateConversationTitle: jest.fn(),
    createMessage: jest.fn(),
    deleteConversation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIConversationService,
        {
          provide: AIConversationRepository,
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<AIConversationService>(AIConversationService);
  });

  describe('createConversation', () => {
    it('should create a conversation for the user', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        title: 'My conversation',
      };

      repositoryMock.createConversation.mockResolvedValue(conversation);

      await expect(
        service.createConversation('user-id', 'My conversation'),
      ).resolves.toEqual(conversation);

      expect(repositoryMock.createConversation).toHaveBeenCalledWith(
        'user-id',
        'My conversation',
      );
    });
  });

  describe('findMany', () => {
    it('should return only the user conversations', async () => {
      const conversations = [
        {
          id: 'conversation-1',
          userId: 'user-id',
        },
      ];

      repositoryMock.findManyConversationsByUserId.mockResolvedValue(
        conversations,
      );

      await expect(service.findMany('user-id')).resolves.toEqual(conversations);

      expect(repositoryMock.findManyConversationsByUserId).toHaveBeenCalledWith(
        'user-id',
      );
    });
  });

  describe('findById', () => {
    it('should return an owned conversation with messages', async () => {
      const conversation = {
        id: 'conversation-id',
        userId: 'user-id',
        messages: [],
      };

      repositoryMock.findConversationWithMessagesByIdAndUserId.mockResolvedValue(
        conversation,
      );

      await expect(
        service.findById('user-id', 'conversation-id'),
      ).resolves.toEqual(conversation);
    });

    it('should throw when the conversation does not belong to the user', async () => {
      repositoryMock.findConversationWithMessagesByIdAndUserId.mockResolvedValue(
        null,
      );

      await expect(
        service.findById('user-id', 'conversation-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addMessage', () => {
    it('should add a message to an owned conversation', async () => {
      repositoryMock.findConversationByIdAndUserId.mockResolvedValue({
        id: 'conversation-id',
        userId: 'user-id',
      });

      const message = {
        id: 'message-id',
        conversationId: 'conversation-id',
        role: AIMessageRole.USER,
        content: 'Hello AI',
        model: null,
      };

      repositoryMock.createMessage.mockResolvedValue(message);

      await expect(
        service.addMessage(
          'user-id',
          'conversation-id',
          AIMessageRole.USER,
          '  Hello AI  ',
        ),
      ).resolves.toEqual(message);

      expect(repositoryMock.createMessage).toHaveBeenCalledWith(
        'conversation-id',
        AIMessageRole.USER,
        'Hello AI',
        undefined,
      );
    });

    it('should reject a message for a conversation owned by another user', async () => {
      repositoryMock.findConversationByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.addMessage(
          'user-id',
          'conversation-id',
          AIMessageRole.USER,
          'Hello',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repositoryMock.createMessage).not.toHaveBeenCalled();
    });

    it('should reject an empty message', async () => {
      repositoryMock.findConversationByIdAndUserId.mockResolvedValue({
        id: 'conversation-id',
        userId: 'user-id',
      });

      await expect(
        service.addMessage(
          'user-id',
          'conversation-id',
          AIMessageRole.USER,
          '   ',
        ),
      ).rejects.toThrow('AI message content cannot be empty');

      expect(repositoryMock.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('updateTitle', () => {
    it('should update an owned conversation title', async () => {
      repositoryMock.findConversationByIdAndUserId
        .mockResolvedValueOnce({
          id: 'conversation-id',
          userId: 'user-id',
        })
        .mockResolvedValueOnce({
          id: 'conversation-id',
          userId: 'user-id',
          title: 'Updated',
        });

      repositoryMock.updateConversationTitle.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.updateTitle('user-id', 'conversation-id', 'Updated'),
      ).resolves.toEqual({
        id: 'conversation-id',
        userId: 'user-id',
        title: 'Updated',
      });

      expect(repositoryMock.updateConversationTitle).toHaveBeenCalledWith(
        'conversation-id',
        'user-id',
        'Updated',
      );
    });

    it('should throw when updating another user conversation', async () => {
      repositoryMock.findConversationByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.updateTitle('user-id', 'conversation-id', 'Updated'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repositoryMock.updateConversationTitle).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete an owned conversation', async () => {
      repositoryMock.findConversationByIdAndUserId.mockResolvedValue({
        id: 'conversation-id',
        userId: 'user-id',
      });

      repositoryMock.deleteConversation.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.remove('user-id', 'conversation-id'),
      ).resolves.toEqual({
        message: 'AI conversation deleted successfully',
      });

      expect(repositoryMock.deleteConversation).toHaveBeenCalledWith(
        'conversation-id',
        'user-id',
      );
    });

    it('should throw when deleting another user conversation', async () => {
      repositoryMock.findConversationByIdAndUserId.mockResolvedValue(null);

      await expect(
        service.remove('user-id', 'conversation-id'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repositoryMock.deleteConversation).not.toHaveBeenCalled();
    });
  });
});
