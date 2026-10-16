import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Allow NestJS lifecycle hooks to run when the process receives
  // supported shutdown signals.
  app.enableShutdownHooks();

  // Security headers.
  app.use(helmet());

  // Allow only the configured frontend origin.
  const frontendUrl = configService.get<string>('app.frontendUrl');

  app.enableCors({
    origin: frontendUrl ? [frontendUrl] : [],
    credentials: true,
  });

  // Global API prefix, e.g. /api/v1/auth/login.
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Reject malformed and unexpected request input.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // Standardized HTTP error responses.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Keep Swagger disabled in production.
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

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);
}

void bootstrap();
