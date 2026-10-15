import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { createE2EApp } from './helpers/create-e2e-app';

jest.setTimeout(30000);

describe('Authentication rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await createE2EApp(moduleFixture.createNestApplication());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should limit login requests after five attempts in one minute', async () => {
    const server = app.getHttpServer();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(server).post('/api/v1/auth/login').send({}).expect(400);
    }

    const limitedResponse = await request(server)
      .post('/api/v1/auth/login')
      .send({})
      .expect(429);

    expect(limitedResponse.body).toMatchObject({
      success: false,
      statusCode: 429,
    });
  });
});
