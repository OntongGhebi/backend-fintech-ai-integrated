import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from 'src/database/prisma/prisma.service';
import { AIConversationRepository } from './ai-conversation.repository';

describe('AIConversationRepository idempotent user message', () => {
  let repository: AIConversationRepository;

  const message = {
    id: 'message-id',
    conversationId: 'conversation-id',
    role: 'USER',
    content: 'Analisis pengeluaran saya',
    model: null,
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

  beforeEach(async () => {
    jest.resetAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    );

    txMock.aIMessage.create.mockResolvedValue(message);
    txMock.aIConversation.updateMany.mockResolvedValue({ count: 1 });
    txMock.$executeRaw.mockResolvedValue(1);

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

  it('creates the user message and links it to the request in one transaction', async () => {
    const result = await repository.createIdempotentUserMessage({
      requestId: 'request-id',
      conversationId: 'conversation-id',
      content: 'Analisis pengeluaran saya',
    });

    expect(result).toEqual(message);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    expect(txMock.aIMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conversation-id',
        role: expect.anything(),
        content: 'Analisis pengeluaran saya',
        model: null,
      },
    });

    expect(txMock.aIConversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-id',
      },
      data: {
        updatedAt: expect.any(Date),
      },
    });

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('throws when the idempotency request cannot be linked', async () => {
    txMock.$executeRaw.mockResolvedValue(0);

    await expect(
      repository.createIdempotentUserMessage({
        requestId: 'request-id',
        conversationId: 'conversation-id',
        content: 'Analisis pengeluaran saya',
      }),
    ).rejects.toThrow('Unable to link user message to the idempotency request');

    // The transaction rejects, so Prisma rolls back the inserted message
    // and the conversation timestamp update.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('throws when the conversation no longer exists', async () => {
    txMock.aIConversation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.createIdempotentUserMessage({
        requestId: 'request-id',
        conversationId: 'deleted-conversation-id',
        content: 'Analisis pengeluaran saya',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(txMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not create a message when the message insert fails', async () => {
    txMock.aIMessage.create.mockRejectedValue(
      new Error('Database insert failed'),
    );

    await expect(
      repository.createIdempotentUserMessage({
        requestId: 'request-id',
        conversationId: 'conversation-id',
        content: 'Analisis pengeluaran saya',
      }),
    ).rejects.toThrow('Database insert failed');

    expect(txMock.aIConversation.updateMany).not.toHaveBeenCalled();
    expect(txMock.$executeRaw).not.toHaveBeenCalled();
  });
});
