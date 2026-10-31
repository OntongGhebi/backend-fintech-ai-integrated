import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramUpdateDto } from './telegram-update.dto';

describe('TelegramUpdateDto', () => {
  const validationOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: false,
  };

  const createValidUpdate = () => ({
    update_id: 123456789,
    message: {
      message_id: 100,
      from: {
        id: 987654321,
        is_bot: false,
        first_name: 'Ghebi',
        username: 'ghebi',
      },
      chat: {
        id: 987654321,
        type: 'private',
        first_name: 'Ghebi',
        username: 'ghebi',
      },
      date: 1793450000,
      text: 'test webhook',
    },
  });

  async function validateUpdate(payload: unknown) {
    const dto = plainToInstance(TelegramUpdateDto, payload);

    return validate(dto, validationOptions);
  }

  it('should accept a valid Telegram text message without entities', async () => {
    const errors = await validateUpdate(createValidUpdate());

    expect(errors).toHaveLength(0);
  });

  it('should accept a Telegram message containing empty entities', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      entities: [],
    };

    const errors = await validateUpdate(payload);

    expect(errors).toHaveLength(0);
  });

  it('should accept a Telegram bot command entity', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      text: '/start 12345678',
      entities: [
        {
          type: 'bot_command',
          offset: 0,
          length: 6,
        },
      ],
    };

    const errors = await validateUpdate(payload);

    expect(errors).toHaveLength(0);
  });

  it('should accept multiple Telegram message entities', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      text: 'Hello @ghebi https://example.com',
      entities: [
        {
          type: 'mention',
          offset: 6,
          length: 6,
        },
        {
          type: 'url',
          offset: 13,
          length: 19,
        },
      ],
    };

    const errors = await validateUpdate(payload);

    expect(errors).toHaveLength(0);
  });

  it('should reject an unsupported entity type', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      entities: [
        {
          type: 'unsupported_entity',
          offset: 0,
          length: 5,
        },
      ],
    };

    const errors = await validateUpdate(payload);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject an entity with negative offset', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      entities: [
        {
          type: 'bot_command',
          offset: -1,
          length: 6,
        },
      ],
    };

    const errors = await validateUpdate(payload);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject an entity with invalid length', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      entities: [
        {
          type: 'bot_command',
          offset: 0,
          length: 0,
        },
      ],
    };

    const errors = await validateUpdate(payload);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown properties inside an entity', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      entities: [
        {
          type: 'bot_command',
          offset: 0,
          length: 6,
          unexpected_property: 'not allowed',
        },
      ],
    };

    const errors = await validateUpdate(payload);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown properties inside message', async () => {
    const payload = createValidUpdate();

    payload.message = {
      ...payload.message,
      unexpected_property: 'not allowed',
    };

    const errors = await validateUpdate(payload);

    expect(errors.length).toBeGreaterThan(0);
  });
});
