import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { AIMessageRole } from '../../../../generated/prisma/enums';

import { AIChatService } from './ai-chat.service';
import { AIService } from './ai.service';
import { AIConversationService } from './ai-conversation.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AIFinancialContextService } from './ai-financial-context.service';
import { AIChatIdempotencyRepository } from '../repositories/ai-chat-idempotency.repository';

describe('AIChatService idempotency', () => {
  let service: AIChatService;

  const conversationServiceMock = {
    findById: jest.fn(),
    addMessage: jest.fn(),
    addIdempotentUserMessage: jest.fn(),
    addIdempotentAssistantMessageAndCompleteRequest: jest.fn(),
  };

  const aiServiceMock = {
    complete: jest.fn(),
  };

  const financialContextServiceMock = {
    getContext: jest.fn(),
  };

  const idempotencyRepositoryMock = {
    claimRequest: jest.fn(),
    setUserMessageId: jest.fn(),
    completeRequest: jest.fn(),
    markFailed: jest.fn(),
    findById: jest.fn(),
  };

  const userId = 'user-id';
  const conversationId = 'conversation-id';
  const idempotencyKey = 'retry-key-0001';
  const content = 'Analisis pengeluaran saya';

  const hashContent = (value: string): string =>
    createHash('sha256').update(value, 'utf8').digest('hex');

  const createConversation = (messages: any[] = []) => ({
    id: conversationId,
    userId,
    title: 'Test conversation',
    messages,
  });

  const createMessage = (
    id: string,
    role: AIMessageRole,
    messageContent: string,
    model: string | null = null,
  ) => ({
    id,
    role,
    content: messageContent,
    model,
    createdAt: new Date('2026-10-26T08:00:00.000Z'),
  });

  const createRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'idempotency-request-id',
    user_id: userId,
    conversation_id: conversationId,
    idempotency_key: idempotencyKey,
    request_hash: hashContent(content),
    status: 'processing' as const,
    user_message_id: null,
    assistant_message_id: null,
    response_payload: null,
    error_code: null,
    created_at: new Date('2026-10-26T08:00:00.000Z'),
    updated_at: new Date('2026-10-26T08:00:00.000Z'),
    ...overrides,
  });

  const successfulCompletion = {
    content: 'Berikut analisis pengeluaran Anda.',
    provider: 'openai-compatible',
    model: 'test-model',
    usage: {
      inputTokens: 10,
      outputTokens: 12,
      totalTokens: 22,
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    financialContextServiceMock.getContext.mockResolvedValue({
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      summary: {
        totalIncome: '5000000.00',
        totalExpense: '1750000.00',
        netCashFlow: '3250000.00',
      },
      expensesByCategory: [],
      recentTransactions: [],
      budgets: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIChatService,
        AIConversationContextService,
        {
          provide: AIConversationService,
          useValue: conversationServiceMock,
        },
        {
          provide: AIService,
          useValue: aiServiceMock,
        },
        {
          provide: AIFinancialContextService,
          useValue: financialContextServiceMock,
        },
        {
          provide: AIChatIdempotencyRepository,
          useValue: idempotencyRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<AIChatService>(AIChatService);
  });

  describe('completed request replay', () => {
    it('should return the stored response without calling the AI provider again', async () => {
      const savedResponse = {
        conversationId,
        message: createMessage(
          'assistant-message-id',
          AIMessageRole.ASSISTANT,
          'Respons yang sudah tersimpan.',
          'test-model',
        ),
        provider: 'openai-compatible',
        model: 'test-model',
        usage: {
          inputTokens: 10,
          outputTokens: 8,
          totalTokens: 18,
        },
      };

      conversationServiceMock.findById.mockResolvedValue(createConversation());

      idempotencyRepositoryMock.claimRequest.mockResolvedValue({
        record: createRecord({
          status: 'completed',
          assistant_message_id: 'assistant-message-id',
          response_payload: savedResponse,
        }),
        claimed: false,
      });

      await expect(
        service.sendMessage(userId, conversationId, content, idempotencyKey),
      ).resolves.toEqual(savedResponse);

      expect(idempotencyRepositoryMock.claimRequest).toHaveBeenCalledWith({
        userId,
        conversationId,
        idempotencyKey,
        requestHash: hashContent(content),
      });

      expect(aiServiceMock.complete).not.toHaveBeenCalled();
      expect(conversationServiceMock.addMessage).not.toHaveBeenCalled();
      expect(
        conversationServiceMock.addIdempotentUserMessage,
      ).not.toHaveBeenCalled();
      expect(
        conversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
      ).not.toHaveBeenCalled();
      expect(idempotencyRepositoryMock.completeRequest).not.toHaveBeenCalled();
    });
  });

  describe('payload conflict', () => {
    it('should reject a reused key when the message content differs', async () => {
      conversationServiceMock.findById.mockResolvedValue(createConversation());

      idempotencyRepositoryMock.claimRequest.mockResolvedValue({
        record: createRecord({
          request_hash: hashContent('Pesan yang berbeda'),
          status: 'completed',
        }),
        claimed: false,
      });

      await expect(
        service.sendMessage(userId, conversationId, content, idempotencyKey),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(aiServiceMock.complete).not.toHaveBeenCalled();
      expect(conversationServiceMock.addMessage).not.toHaveBeenCalled();
      expect(
        conversationServiceMock.addIdempotentUserMessage,
      ).not.toHaveBeenCalled();
    });
  });

  describe('concurrent request protection', () => {
    it('should reject a duplicate while the original request is processing', async () => {
      conversationServiceMock.findById.mockResolvedValue(createConversation());

      idempotencyRepositoryMock.claimRequest.mockResolvedValue({
        record: createRecord({ status: 'processing' }),
        claimed: false,
      });

      await expect(
        service.sendMessage(userId, conversationId, content, idempotencyKey),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(aiServiceMock.complete).not.toHaveBeenCalled();
      expect(conversationServiceMock.addMessage).not.toHaveBeenCalled();
      expect(
        conversationServiceMock.addIdempotentUserMessage,
      ).not.toHaveBeenCalled();
      expect(
        conversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
      ).not.toHaveBeenCalled();
    });
  });

  describe('new idempotent request', () => {
    it('should persist the user message and save the completed response atomically', async () => {
      const userMessage = createMessage(
        'user-message-id',
        AIMessageRole.USER,
        content,
      );

      const assistantMessage = createMessage(
        'assistant-message-id',
        AIMessageRole.ASSISTANT,
        successfulCompletion.content,
        successfulCompletion.model,
      );

      const expectedResult = {
        conversationId,
        message: assistantMessage,
        provider: successfulCompletion.provider,
        model: successfulCompletion.model,
        usage: successfulCompletion.usage,
      };

      conversationServiceMock.findById
        .mockResolvedValueOnce(createConversation())
        .mockResolvedValueOnce(createConversation([userMessage]));

      conversationServiceMock.addIdempotentUserMessage.mockResolvedValueOnce(
        userMessage,
      );

      aiServiceMock.complete.mockResolvedValue(successfulCompletion);

      idempotencyRepositoryMock.claimRequest.mockResolvedValue({
        record: createRecord(),
        claimed: true,
      });

      conversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest.mockResolvedValueOnce(
        expectedResult,
      );

      await expect(
        service.sendMessage(
          userId,
          conversationId,
          `  ${content}  `,
          idempotencyKey,
        ),
      ).resolves.toEqual(expectedResult);

      expect(
        conversationServiceMock.addIdempotentUserMessage,
      ).toHaveBeenCalledTimes(1);

      expect(
        conversationServiceMock.addIdempotentUserMessage,
      ).toHaveBeenCalledWith(
        userId,
        conversationId,
        'idempotency-request-id',
        content,
      );

      expect(idempotencyRepositoryMock.setUserMessageId).not.toHaveBeenCalled();

      expect(aiServiceMock.complete).toHaveBeenCalledTimes(1);

      expect(conversationServiceMock.addMessage).not.toHaveBeenCalled();

      expect(
        conversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
      ).toHaveBeenCalledTimes(1);

      expect(
        conversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
      ).toHaveBeenCalledWith({
        requestId: 'idempotency-request-id',
        conversationId,
        content: successfulCompletion.content,
        model: successfulCompletion.model,
        provider: successfulCompletion.provider,
        usage: successfulCompletion.usage,
      });

      expect(idempotencyRepositoryMock.completeRequest).not.toHaveBeenCalled();
      expect(idempotencyRepositoryMock.markFailed).not.toHaveBeenCalled();
    });

    it('should mark the request failed when the AI provider fails', async () => {
      const userMessage = createMessage(
        'user-message-id',
        AIMessageRole.USER,
        content,
      );

      conversationServiceMock.findById
        .mockResolvedValueOnce(createConversation())
        .mockResolvedValueOnce(createConversation([userMessage]));

      conversationServiceMock.addIdempotentUserMessage.mockResolvedValueOnce(
        userMessage,
      );

      aiServiceMock.complete.mockRejectedValue(
        new ServiceUnavailableException('AI provider request failed'),
      );

      idempotencyRepositoryMock.claimRequest.mockResolvedValue({
        record: createRecord(),
        claimed: true,
      });

      idempotencyRepositoryMock.markFailed.mockResolvedValue(undefined);

      await expect(
        service.sendMessage(userId, conversationId, content, idempotencyKey),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(
        conversationServiceMock.addIdempotentUserMessage,
      ).toHaveBeenCalledTimes(1);

      expect(conversationServiceMock.addMessage).not.toHaveBeenCalled();

      expect(
        conversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
      ).not.toHaveBeenCalled();

      expect(idempotencyRepositoryMock.markFailed).toHaveBeenCalledWith(
        'idempotency-request-id',
        'HTTP_503',
      );

      expect(idempotencyRepositoryMock.completeRequest).not.toHaveBeenCalled();
    });
  });

  describe('idempotency key validation', () => {
    it('should reject a key shorter than eight characters', async () => {
      conversationServiceMock.findById.mockResolvedValue(createConversation());

      await expect(
        service.sendMessage(userId, conversationId, content, 'short'),
      ).rejects.toThrow('Idempotency-Key');

      expect(idempotencyRepositoryMock.claimRequest).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });

    it('should reject a key containing unsupported characters', async () => {
      conversationServiceMock.findById.mockResolvedValue(createConversation());

      await expect(
        service.sendMessage(userId, conversationId, content, 'invalid key 123'),
      ).rejects.toThrow('Idempotency-Key');

      expect(idempotencyRepositoryMock.claimRequest).not.toHaveBeenCalled();
      expect(aiServiceMock.complete).not.toHaveBeenCalled();
    });
  });
});
