import { Test, TestingModule } from '@nestjs/testing';

import { AiController } from './ai.controller';
import { AIChatService } from './services/ai-chat.service';
import { AIConversationService } from './services/ai-conversation.service';

describe('AiController', () => {
  let controller: AiController;

  const conversationService = {
    createConversation: jest.fn(),
    findMany: jest.fn(),
    findById: jest.fn(),
    updateTitle: jest.fn(),
    remove: jest.fn(),
  };

  const chatService = {
    sendMessage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        {
          provide: AIConversationService,
          useValue: conversationService,
        },
        {
          provide: AIChatService,
          useValue: chatService,
        },
      ],
    }).compile();

    controller = module.get<AiController>(AiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a conversation for the authenticated user', async () => {
    const expected = {
      id: 'conversation-id',
      userId: 'user-id',
      title: 'Analisis pengeluaran',
    };

    conversationService.createConversation.mockResolvedValue(expected);

    await expect(
      controller.createConversation('user-id', {
        title: 'Analisis pengeluaran',
      }),
    ).resolves.toEqual(expected);

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      'user-id',
      'Analisis pengeluaran',
    );
  });

  it('should list conversations for the authenticated user', async () => {
    const expected = [{ id: 'conversation-id' }];
    conversationService.findMany.mockResolvedValue(expected);

    await expect(controller.findConversations('user-id')).resolves.toEqual(
      expected,
    );

    expect(conversationService.findMany).toHaveBeenCalledWith('user-id');
  });

  it('should return one conversation and its messages', async () => {
    const expected = {
      id: 'conversation-id',
      messages: [{ id: 'message-id', content: 'Halo' }],
    };

    conversationService.findById.mockResolvedValue(expected);

    await expect(
      controller.findConversation('user-id', 'conversation-id'),
    ).resolves.toEqual(expected);

    expect(conversationService.findById).toHaveBeenCalledWith(
      'user-id',
      'conversation-id',
    );
  });

  it('should send a message using the authenticated user', async () => {
    const expected = {
      conversationId: 'conversation-id',
      message: {
        id: 'assistant-message-id',
        role: 'ASSISTANT',
        content: 'Berikut analisisnya.',
      },
      provider: 'openai-compatible',
      model: 'test-model',
    };

    chatService.sendMessage.mockResolvedValue(expected);

    await expect(
      controller.sendMessage('user-id', 'conversation-id', {
        content: 'Analisis pengeluaran saya',
      }),
    ).resolves.toEqual(expected);

    expect(chatService.sendMessage).toHaveBeenCalledWith(
      'user-id',
      'conversation-id',
      'Analisis pengeluaran saya',
    );
  });

  it('should update the conversation title', async () => {
    const expected = {
      id: 'conversation-id',
      title: 'Evaluasi Oktober',
    };

    conversationService.updateTitle.mockResolvedValue(expected);

    await expect(
      controller.updateConversation('user-id', 'conversation-id', {
        title: 'Evaluasi Oktober',
      }),
    ).resolves.toEqual(expected);

    expect(conversationService.updateTitle).toHaveBeenCalledWith(
      'user-id',
      'conversation-id',
      'Evaluasi Oktober',
    );
  });

  it('should delete a conversation for the authenticated user', async () => {
    const expected = {
      message: 'AI conversation deleted successfully',
    };

    conversationService.remove.mockResolvedValue(expected);

    await expect(
      controller.removeConversation('user-id', 'conversation-id'),
    ).resolves.toEqual(expected);

    expect(conversationService.remove).toHaveBeenCalledWith(
      'user-id',
      'conversation-id',
    );
  });
});
