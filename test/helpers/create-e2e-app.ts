import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';

export async function createE2EApp(
  app: INestApplication,
): Promise<INestApplication> {
  const configService = app.get(ConfigService);

  app.use(helmet());

  const frontendUrl = configService.get<string>('app.frontendUrl');

  app.enableCors({
    origin: frontendUrl ? [frontendUrl] : [],
    credentials: true,
  });

  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  app.setGlobalPrefix(apiPrefix);

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

  app.useGlobalFilters(new HttpExceptionFilter());

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

  await app.init();

  return app;
}
