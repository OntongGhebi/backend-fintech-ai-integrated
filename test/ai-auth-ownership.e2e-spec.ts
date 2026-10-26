import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from 'src/app.module';
import { AccessTokenGuard } from 'src/modules/auth/guards/access-token.guard';
import { AIChatService } from 'src/modules/ai/services/ai-chat.service';
import { AIConversationRepository } from 'src/modules/ai/repositories/ai-conversation.repository';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

/**
 * AI authentication and tenant-isolation E2E tests.
 * Tokens are deterministic test credentials; production JWT cryptography is
 * covered by the auth module tests. This suite verifies that the AI HTTP layer
 * requires an authenticated principal and consistently scopes conversation
 * operations to that principal's user ID.
 */
describe('AI authentication and ownership (e2e)', () => {
  let app: INestApplication;

  const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const conversationA = '11111111-1111-4111-8111-111111111111';
  const conversationB = '22222222-2222-4222-8222-222222222222';

  type Conversation = {
    id: string;
    userId: string;
    title: string | null;
    messages: Array<Record<string, unknown>>;
  };

  let records: Conversation[];

  const repositoryMock = {
    createConversation: jest.fn(
      async (userId: string, title?: string | null) => {
        const record: Conversation = {
          id: userId === userA ? conversationA : conversationB,
          userId,
          title: title ?? null,
          messages: [],
        };
        records.push(record);
        return record;
      },
    ),
    findManyConversationsByUserId: jest.fn(async (userId: string) =>
      records
        .filter((record) => record.userId === userId)
        .map(({ messages: _messages, ...record }) => record),
    ),
    findConversationByIdAndUserId: jest.fn(
      async (id: string, userId: string) =>
        records.find(
          (record) => record.id === id && record.userId === userId,
        ) ?? null,
    ),
    findConversationWithMessagesByIdAndUserId: jest.fn(
      async (id: string, userId: string) =>
        records.find(
          (record) => record.id === id && record.userId === userId,
        ) ?? null,
    ),
    updateConversationTitle: jest.fn(
      async (id: string, userId: string, title: string | null) => {
        const record = records.find(
          (item) => item.id === id && item.userId === userId,
        );
        if (record) record.title = title;
        return { count: record ? 1 : 0 };
      },
    ),
    deleteConversation: jest.fn(async (id: string, userId: string) => {
      records = records.filter(
        (item) => !(item.id === id && item.userId === userId),
      );
      return { count: 1 };
    }),
    createMessage: jest.fn(
      async (
        conversationId: string,
        role: string,
        content: string,
        model?: string | null,
      ) => ({
        id: '33333333-3333-4333-8333-333333333333',
        conversationId,
        role,
        content,
        model: model ?? null,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    ),
    findMessagesByConversationId: jest.fn(),
    findContextMessages: jest.fn(async () => []),
  };

  const chatServiceMock = {
    sendMessage: jest.fn(
      async (userId: string, conversationId: string, content: string) => {
        const owned = records.find(
          (record) => record.id === conversationId && record.userId === userId,
        );
        if (!owned) throw new NotFoundException('AI conversation not found');
        return {
          conversationId,
          message: {
            id: '44444444-4444-4444-8444-444444444444',
            role: 'ASSISTANT',
            content: `Test response: ${content}`,
            model: 'test-model',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
          provider: 'test-provider',
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        };
      },
    ),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => {
              headers: Record<string, string | string[] | undefined>;
              user?: { id: string };
            };
          };
        }) => {
          const req = context.switchToHttp().getRequest();
          const authorization = req.headers.authorization;
          if (authorization === 'Bearer test-token-user-a') {
            req.user = { id: userA };
            return true;
          }
          if (authorization === 'Bearer test-token-user-b') {
            req.user = { id: userB };
            return true;
          }
          return false;
        },
      })
      .overrideProvider(AIConversationRepository)
      .useValue(repositoryMock)
      .overrideProvider(AIChatService)
      .useValue(chatServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await createE2EApp(app);
  });

  beforeEach(() => {
    records = [
      {
        id: conversationA,
        userId: userA,
        title: 'Private conversation A',
        messages: [{ id: 'a-message', role: 'USER', content: 'private A' }],
      },
      {
        id: conversationB,
        userId: userB,
        title: 'Private conversation B',
        messages: [{ id: 'b-message', role: 'USER', content: 'private B' }],
      },
    ];
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  const api = (path: string) => `/api/v1${path}`;

  const asUserA = () => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer test-token-user-a'),

    post: (path: string) =>
      request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer test-token-user-a'),

    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(path)
        .set('Authorization', 'Bearer test-token-user-a'),

    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(path)
        .set('Authorization', 'Bearer test-token-user-a'),
  });

  const asUserB = () => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer test-token-user-b'),

    post: (path: string) =>
      request(app.getHttpServer())
        .post(path)
        .set('Authorization', 'Bearer test-token-user-b'),

    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(path)
        .set('Authorization', 'Bearer test-token-user-b'),

    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(path)
        .set('Authorization', 'Bearer test-token-user-b'),
  });

  it('rejects requests without an authentication token', async () => {
    await request(app.getHttpServer())
      .get(api('/ai/conversations'))
      .expect(403);
  });

  it('rejects an invalid authentication token', async () => {
    await request(app.getHttpServer())
      .get(api('/ai/conversations'))
      .set('Authorization', 'Bearer invalid-token')
      .expect(403);
  });

  it('only lists conversations owned by the authenticated user', async () => {
    const responseA = await asUserA().get(api('/ai/conversations')).expect(200);
    const responseB = await asUserB().get(api('/ai/conversations')).expect(200);

    expect(responseA.body).toHaveLength(1);
    expect(responseA.body[0].id).toBe(conversationA);
    expect(responseB.body).toHaveLength(1);
    expect(responseB.body[0].id).toBe(conversationB);
  });

  it('prevents user A from reading user B conversation', async () => {
    await asUserA()
      .get(api(`/ai/conversations/${conversationB}`))
      .expect(404);
  });

  it('prevents user A from sending a message to user B conversation', async () => {
    await asUserA()
      .post(api(`/ai/conversations/${conversationB}/messages`))
      .send({ content: 'Read and expose private data' })
      .expect(404);
    expect(chatServiceMock.sendMessage).toHaveBeenCalledWith(
      userA,
      conversationB,
      'Read and expose private data',
      undefined,
    );
  });

  it('prevents user A from changing user B conversation title', async () => {
    await asUserA()
      .patch(api(`/ai/conversations/${conversationB}`))
      .send({ title: 'Hijacked title' })
      .expect(404);
    expect(records.find((record) => record.id === conversationB)?.title).toBe(
      'Private conversation B',
    );
  });

  it('prevents user A from deleting user B conversation', async () => {
    await asUserA()
      .delete(api(`/ai/conversations/${conversationB}`))
      .expect(404);
    expect(records.some((record) => record.id === conversationB)).toBe(true);
  });

  it('creates a conversation for the authenticated user and ignores no client-supplied owner', async () => {
    await asUserA()
      .post(api('/ai/conversations'))
      .send({ title: 'Created by A', userId: userB })
      .expect(400);

    await asUserA()
      .post(api('/ai/conversations'))
      .send({ title: 'Created by A' })
      .expect(201);

    expect(repositoryMock.createConversation).toHaveBeenCalledWith(
      userA,
      'Created by A',
    );
    expect(
      records.find((record) => record.title === 'Created by A')?.userId,
    ).toBe(userA);
  });
});
