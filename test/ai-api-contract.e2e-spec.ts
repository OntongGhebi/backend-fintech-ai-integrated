import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from 'src/app.module';
import { AccessTokenGuard } from 'src/modules/auth/guards/access-token.guard';
import { AIChatService } from 'src/modules/ai/services/ai-chat.service';
import { AIConversationService } from 'src/modules/ai/services/ai-conversation.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);
/**
 * HTTP-level contract tests for the AI conversation endpoints.
 * The authentication guard is replaced with a deterministic authenticated
 * principal so these tests focus on routing, validation, status codes, and
 * request/response contracts rather than JWT cryptography.
 */
describe('AI API contract (e2e)', () => {
  let app: INestApplication;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const conversationId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const messageId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const conversationServiceMock = {
    createConversation: jest.fn(),
    findMany: jest.fn(),
    findById: jest.fn(),
    updateTitle: jest.fn(),
    remove: jest.fn(),
  };

  const chatServiceMock = {
    sendMessage: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => { user?: { id: string } };
          };
        }) => {
          context.switchToHttp().getRequest().user = { id: userId };
          return true;
        },
      })
      .overrideProvider(AIConversationService)
      .useValue(conversationServiceMock)
      .overrideProvider(AIChatService)
      .useValue(chatServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await createE2EApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  const api = (path: string) => `/api/v1${path}`;

  it('POST /ai/conversations returns 201 and forwards the authenticated user and title', async () => {
    const expected = {
      id: conversationId,
      userId,
      title: 'Analisis Oktober',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    conversationServiceMock.createConversation.mockResolvedValue(expected);

    const response = await request(app.getHttpServer())
      .post(api('/ai/conversations'))
      .send({ title: 'Analisis Oktober' })
      .expect(201);

    expect(response.body).toEqual(expected);
    expect(conversationServiceMock.createConversation).toHaveBeenCalledWith(
      userId,
      'Analisis Oktober',
    );
  });

  it('GET /ai/conversations returns the authenticated user conversation list', async () => {
    const expected = [{ id: conversationId, title: 'Analisis Oktober' }];
    conversationServiceMock.findMany.mockResolvedValue(expected);

    const response = await request(app.getHttpServer())
      .get(api('/ai/conversations'))
      .expect(200);

    expect(response.body).toEqual(expected);
    expect(conversationServiceMock.findMany).toHaveBeenCalledWith(userId);
  });

  it('GET /ai/conversations/:id returns a conversation with messages', async () => {
    const expected = {
      id: conversationId,
      title: 'Analisis Oktober',
      messages: [
        {
          id: messageId,
          role: 'USER',
          content: 'Analisis pengeluaran saya',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    };
    conversationServiceMock.findById.mockResolvedValue(expected);

    const response = await request(app.getHttpServer())
      .get(api(`/ai/conversations/${conversationId}`))
      .expect(200);

    expect(response.body).toEqual(expected);
    expect(conversationServiceMock.findById).toHaveBeenCalledWith(
      userId,
      conversationId,
    );
  });

  it('POST /ai/conversations/:id/messages returns the assistant message contract', async () => {
    const expected = {
      conversationId,
      message: {
        id: messageId,
        role: 'ASSISTANT',
        content: 'Berikut analisis keuangan Anda.',
        model: 'test-model',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
      provider: 'e2e-provider',
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    };
    chatServiceMock.sendMessage.mockResolvedValue(expected);

    const response = await request(app.getHttpServer())
      .post(api(`/ai/conversations/${conversationId}/messages`))
      .send({ content: '  Analisis pengeluaran saya  ' })
      .expect(201);

    expect(response.body).toEqual(expected);
    expect(chatServiceMock.sendMessage).toHaveBeenCalledWith(
      userId,
      conversationId,
      'Analisis pengeluaran saya',
      undefined,
    );
  });

  it('rejects an empty message after DTO normalization', async () => {
    const response = await request(app.getHttpServer())
      .post(api(`/ai/conversations/${conversationId}/messages`))
      .send({ content: '   ' })
      .expect(400);

    expect(response.body).toHaveProperty('message');
    expect(chatServiceMock.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects messages longer than 8000 characters', async () => {
    const response = await request(app.getHttpServer())
      .post(api(`/ai/conversations/${conversationId}/messages`))
      .send({ content: 'x'.repeat(8001) })
      .expect(400);

    expect(response.body).toHaveProperty('message');
    expect(chatServiceMock.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects unknown request fields instead of silently accepting them', async () => {
    await request(app.getHttpServer())
      .post(api(`/ai/conversations/${conversationId}/messages`))
      .send({ content: 'Halo AI', userId: 'attacker-controlled-user' })
      .expect(400);

    expect(chatServiceMock.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects malformed conversation UUIDs before invoking services', async () => {
    await request(app.getHttpServer())
      .get(api('/ai/conversations/not-a-uuid'))
      .expect(400);

    expect(conversationServiceMock.findById).not.toHaveBeenCalled();
  });

  it('PATCH /ai/conversations/:id updates the title contract', async () => {
    const expected = { id: conversationId, title: 'Evaluasi Oktober' };
    conversationServiceMock.updateTitle.mockResolvedValue(expected);

    const response = await request(app.getHttpServer())
      .patch(api(`/ai/conversations/${conversationId}`))
      .send({ title: 'Evaluasi Oktober' })
      .expect(200);

    expect(response.body).toEqual(expected);
    expect(conversationServiceMock.updateTitle).toHaveBeenCalledWith(
      userId,
      conversationId,
      'Evaluasi Oktober',
    );
  });

  it('DELETE /ai/conversations/:id returns the documented deletion message', async () => {
    const expected = { message: 'AI conversation deleted successfully' };
    conversationServiceMock.remove.mockResolvedValue(expected);

    const response = await request(app.getHttpServer())
      .delete(api(`/ai/conversations/${conversationId}`))
      .expect(200);

    expect(response.body).toEqual(expected);
    expect(conversationServiceMock.remove).toHaveBeenCalledWith(
      userId,
      conversationId,
    );
  });
});
