import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  /**
   * Security
   */
  app.use(helmet());

  /**
   * CORS
   */
  const frontendUrl = configService.get<string>('app.frontendUrl');

  app.enableCors({
    origin: frontendUrl ? [frontendUrl] : [],
    credentials: true,
  });

  /**
   * Global API prefix
   *
   * Example:
   * /api/v1/auth/login
   */
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');

  app.setGlobalPrefix(apiPrefix);

  /**
   * Global validation
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /**
   * Global exception filter
   */
  app.useGlobalFilters(new HttpExceptionFilter());

  /**
   * Swagger
   *
   * Swagger is enabled only outside production
   * to avoid unnecessarily exposing API documentation
   * in a production environment.
   */
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Fintech AI Integrated API')
      .setDescription(
        'REST API for the Fintech AI Integrated financial management platform.',
      )
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      })
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, document);
  }

  /**
   * Start application
   */
  const port = configService.get<number>('app.port', 3000);

  await app.listen(port);
}

bootstrap();
