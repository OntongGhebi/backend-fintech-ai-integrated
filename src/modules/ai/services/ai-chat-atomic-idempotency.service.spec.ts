import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AIMessageRole } from '../../../../generated/prisma/enums';

import { AI_USAGE_FEATURES } from '../constants/ai-usage.constants';
import { AIChatIdempotencyRepository } from '../repositories/ai-chat-idempotency.repository';
import { AIService } from './ai.service';
import { AIChatService } from './ai-chat.service';
import { AIConversationContextService } from './ai-conversation-context.service';
import { AIConversationService } from './ai-conversation.service';
import { AIFinancialContextService } from './ai-financial-context.service';

describe('AIChatService atomic idempotency completion', () => {
  let service: AIChatService;

  const userId = 'user-id';
  const conversationId = 'conversation-id';
  const requestId = 'request-id';
  const idempotencyKey = 'chat-request-123';
  const messageContent = 'Ringkas pengeluaran saya';

  const requestHash = createHash('sha256')
    .update(messageContent, 'utf8')
    .digest('hex');

  const userMessage = {
    id: 'user-message-id',
    role: AIMessageRole.USER,
    content: messageContent,
    model: null,
    createdAt: new Date('2026-10-26T10:00:00.000Z'),
  };

  const assistantMessage = {
    id: 'assistant-message-id',
    role: AIMessageRole.ASSISTANT,
    content: 'Berikut ringkasan pengeluaran Anda.',
    model: 'test-model',
    createdAt: new Date('2026-10-26T10:00:01.000Z'),
  };

  const conversation = {
    id: conversationId,
    userId,
    title: 'Percakapan keuangan',
    messages: [],
  };

  const financialContext = {
    generatedAt: '2026-10-26T00:00:00.000Z',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    period: {
      startDate: '2026-10-01',
      endDateExclusive: '2026-11-01',
    },
    summary: {
      totalIncome: '5000000.00',
      totalExpense: '1750000.00',
      netCashFlow: '3250000.00',
      incomeTransactionCount: 3,
      expenseTransactionCount: 8,
    },
    expensesByCategory: [],
    recentTransactions: [],
    budgets: [],
  };

  const usage = {
    inputTokens: 10,
    outputTokens: 12,
    totalTokens: 22,
  };

  const response = {
    conversationId,
    message: assistantMessage,
    provider: 'openai-compatible',
    model: 'test-model',
    usage,
  };

  const aiConversationServiceMock = {
    findById: jest.fn(),
    addMessage: jest.fn(),
    addIdempotentUserMessage: jest.fn(),
    addIdempotentAssistantMessageAndCompleteRequest: jest.fn(),
  };

  const aiServiceMock = {
    complete: jest.fn(),
  };

  const aiConversationContextServiceMock = {
    getContext: jest.fn(
      (
        messages: Array<{
          role: AIMessageRole;
          content: string;
        }>,
      ) => messages,
    ),
  };

  const aiFinancialContextServiceMock = {
    getContext: jest.fn().mockResolvedValue(financialContext),
  };

  const idempotencyRepositoryMock = {
    claimRequest: jest.fn(),
    completeRequest: jest.fn(),
    markFailed: jest.fn(),
  };

  const createClaim = (overrides: Record<string, unknown> = {}) => ({
    claimed: true,
    record: {
      id: requestId,
      request_hash: requestHash,
      status: 'processing',
      user_message_id: userMessage.id,
      assistant_message_id: null,
      response_payload: null,
      ...overrides,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AIChatService(
      aiConversationServiceMock as unknown as AIConversationService,
      aiServiceMock as unknown as AIService,
      aiConversationContextServiceMock as unknown as AIConversationContextService,
      aiFinancialContextServiceMock as unknown as AIFinancialContextService,
      idempotencyRepositoryMock as unknown as AIChatIdempotencyRepository,
    );

    idempotencyRepositoryMock.claimRequest.mockResolvedValue(createClaim());

    aiConversationServiceMock.findById
      .mockResolvedValueOnce(conversation)
      .mockResolvedValueOnce({
        ...conversation,
        messages: [userMessage],
      });

    aiServiceMock.complete.mockResolvedValue({
      content: assistantMessage.content,
      provider: response.provider,
      model: response.model,
      usage,
    });

    aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest.mockResolvedValue(
      response,
    );
  });

  it('persists the assistant response through the atomic completion method', async () => {
    await expect(
      service.sendMessage(
        userId,
        conversationId,
        messageContent,
        idempotencyKey,
      ),
    ).resolves.toEqual(response);

    expect(idempotencyRepositoryMock.claimRequest).toHaveBeenCalledWith({
      userId,
      conversationId,
      idempotencyKey,
      requestHash,
    });

    expect(
      aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
    ).toHaveBeenCalledWith({
      requestId,
      conversationId,
      content: assistantMessage.content,
      model: response.model,
      provider: response.provider,
      usage,
    });

    expect(
      aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
    ).toHaveBeenCalledTimes(1);

    expect(aiConversationServiceMock.addMessage).not.toHaveBeenCalled();
    expect(idempotencyRepositoryMock.completeRequest).not.toHaveBeenCalled();
    expect(idempotencyRepositoryMock.markFailed).not.toHaveBeenCalled();

    expect(aiServiceMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'KONTEKS KEUANGAN PENGGUNA (JSON):',
            ),
          }),
          expect.objectContaining({
            role: 'user',
            content: messageContent,
          }),
        ]),
        temperature: 0.2,
      }),
      {
        userId,
        feature: AI_USAGE_FEATURES.CHAT,
      },
    );
  });

  it('persists the user message first when the request has no saved user message ID', async () => {
    idempotencyRepositoryMock.claimRequest.mockResolvedValueOnce(
      createClaim({ user_message_id: null }),
    );

    aiConversationServiceMock.findById.mockReset();
    aiConversationServiceMock.findById
      .mockResolvedValueOnce(conversation)
      .mockResolvedValueOnce({
        ...conversation,
        messages: [userMessage],
      });

    aiConversationServiceMock.addIdempotentUserMessage.mockResolvedValueOnce(
      userMessage,
    );

    await expect(
      service.sendMessage(
        userId,
        conversationId,
        messageContent,
        idempotencyKey,
      ),
    ).resolves.toEqual(response);

    expect(
      aiConversationServiceMock.addIdempotentUserMessage,
    ).toHaveBeenCalledWith(userId, conversationId, requestId, messageContent);

    expect(
      aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
    ).toHaveBeenCalledTimes(1);

    expect(idempotencyRepositoryMock.completeRequest).not.toHaveBeenCalled();
  });

  it('marks the request failed when atomic assistant persistence fails', async () => {
    const persistenceError = new Error(
      'AI idempotency request could not be completed atomically',
    );

    aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest.mockRejectedValueOnce(
      persistenceError,
    );

    await expect(
      service.sendMessage(
        userId,
        conversationId,
        messageContent,
        idempotencyKey,
      ),
    ).rejects.toThrow(persistenceError);

    expect(idempotencyRepositoryMock.markFailed).toHaveBeenCalledWith(
      requestId,
      'AI_CHAT_FAILED',
    );

    expect(idempotencyRepositoryMock.completeRequest).not.toHaveBeenCalled();
  });

  it('marks the request failed when the AI provider fails before persistence', async () => {
    const providerError = new Error('Provider unavailable');

    aiServiceMock.complete.mockRejectedValueOnce(providerError);

    await expect(
      service.sendMessage(
        userId,
        conversationId,
        messageContent,
        idempotencyKey,
      ),
    ).rejects.toThrow(providerError);

    expect(
      aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
    ).not.toHaveBeenCalled();

    expect(idempotencyRepositoryMock.markFailed).toHaveBeenCalledWith(
      requestId,
      'AI_CHAT_FAILED',
    );
  });

  it('returns the stored response without calling the AI provider for a completed request', async () => {
    idempotencyRepositoryMock.claimRequest.mockResolvedValueOnce({
      claimed: false,
      record: {
        id: requestId,
        request_hash: requestHash,
        status: 'completed',
        user_message_id: userMessage.id,
        assistant_message_id: assistantMessage.id,
        response_payload: response,
      },
    });

    await expect(
      service.sendMessage(
        userId,
        conversationId,
        messageContent,
        idempotencyKey,
      ),
    ).resolves.toEqual(response);

    expect(aiServiceMock.complete).not.toHaveBeenCalled();

    expect(
      aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
    ).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different message hash', async () => {
    idempotencyRepositoryMock.claimRequest.mockResolvedValueOnce(
      createClaim({ request_hash: 'different-hash' }),
    );

    await expect(
      service.sendMessage(
        userId,
        conversationId,
        messageContent,
        idempotencyKey,
      ),
    ).rejects.toThrow(ConflictException);

    expect(aiServiceMock.complete).not.toHaveBeenCalled();

    expect(
      aiConversationServiceMock.addIdempotentAssistantMessageAndCompleteRequest,
    ).not.toHaveBeenCalled();
  });
});
