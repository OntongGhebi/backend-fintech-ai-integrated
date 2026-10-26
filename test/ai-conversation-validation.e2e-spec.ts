import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AccessTokenGuard } from '../src/modules/auth/guards/access-token.guard';
import { AIChatService } from '../src/modules/ai/services/ai-chat.service';
import { AIConversationService } from '../src/modules/ai/services/ai-conversation.service';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('AI conversation input validation (e2e)', () => {
  let app: INestApplication;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const conversationId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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

  const api = (path: string) => `/api/v1${path}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<{
            user?: { id: string };
          }>();

          request.user = { id: userId };

          return true;
        },
      })
      .overrideProvider(AIConversationService)
      .useValue(conversationServiceMock)
      .overrideProvider(AIChatService)
      .useValue(chatServiceMock)
      .compile();

    app = await createE2EApp(moduleFixture.createNestApplication());
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /api/v1/ai/conversations', () => {
    it('accepts a valid conversation title', async () => {
      const expected = {
        id: conversationId,
        userId,
        title: 'Analisis pengeluaran',
      };

      conversationServiceMock.createConversation.mockResolvedValue(expected);

      const response = await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({
          title: 'Analisis pengeluaran',
        })
        .expect(201);

      expect(response.body).toEqual(expected);

      expect(conversationServiceMock.createConversation).toHaveBeenCalledWith(
        userId,
        'Analisis pengeluaran',
      );
    });

    it('trims leading and trailing whitespace from the title', async () => {
      const expected = {
        id: conversationId,
        userId,
        title: 'Analisis pengeluaran',
      };

      conversationServiceMock.createConversation.mockResolvedValue(expected);

      await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({
          title: '  Analisis pengeluaran  ',
        })
        .expect(201);

      expect(conversationServiceMock.createConversation).toHaveBeenCalledWith(
        userId,
        'Analisis pengeluaran',
      );
    });

    it('rejects a title containing only whitespace', async () => {
      await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({
          title: '     ',
        })
        .expect(400);

      expect(conversationServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it('rejects an empty title', async () => {
      await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({
          title: '',
        })
        .expect(400);

      expect(conversationServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it('accepts a title containing exactly 255 characters', async () => {
      const title = 'A'.repeat(255);

      conversationServiceMock.createConversation.mockResolvedValue({
        id: conversationId,
        userId,
        title,
      });

      const response = await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({ title })
        .expect(201);

      expect(response.body.title).toBe(title);

      expect(conversationServiceMock.createConversation).toHaveBeenCalledWith(
        userId,
        title,
      );
    });

    it('rejects a title containing more than 255 characters', async () => {
      await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({
          title: 'A'.repeat(256),
        })
        .expect(400);

      expect(conversationServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it.each([
      ['number', 123],
      ['boolean', true],
      ['array', ['Analisis pengeluaran']],
      ['object', { value: 'Analisis pengeluaran' }],
    ])('rejects a title supplied as a %s', async (_label, title) => {
      await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({ title })
        .expect(400);

      expect(conversationServiceMock.createConversation).not.toHaveBeenCalled();
    });

    it('allows a conversation to be created without a title', async () => {
      const expected = {
        id: conversationId,
        userId,
        title: null,
      };

      conversationServiceMock.createConversation.mockResolvedValue(expected);

      const response = await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({})
        .expect(201);

      expect(response.body).toEqual(expected);

      expect(conversationServiceMock.createConversation).toHaveBeenCalledWith(
        userId,
        undefined,
      );
    });

    it('allows a null title', async () => {
      const expected = {
        id: conversationId,
        userId,
        title: null,
      };

      conversationServiceMock.createConversation.mockResolvedValue(expected);

      const response = await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({
          title: null,
        })
        .expect(201);

      expect(response.body).toEqual(expected);

      expect(conversationServiceMock.createConversation).toHaveBeenCalledWith(
        userId,
        null,
      );
    });

    it('rejects an unexpected userId property', async () => {
      await request(app.getHttpServer())
        .post(api('/ai/conversations'))
        .send({
          title: 'Analisis pengeluaran',
          userId: 'attacker-controlled-user',
        })
        .expect(400);

      expect(conversationServiceMock.createConversation).not.toHaveBeenCalled();
    });
  });
});
