import {
  TelegramMessageDto,
  TelegramUpdateDto,
} from './dto/telegram-update.dto';
import { TelegramUpdateParserService } from './telegram-update-parser.service';

describe('TelegramUpdateParserService', () => {
  let service: TelegramUpdateParserService;

  beforeEach(() => {
    service = new TelegramUpdateParserService();
  });

  describe('parse', () => {
    it('should parse a valid text message', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      const message = new TelegramMessageDto();

      message.message_id = 100;
      message.date = 1758630000;

      message.from = {
        id: 987654,
        is_bot: false,
        first_name: 'Ghebi',
        username: 'ghebi',
      };

      message.chat = {
        id: 987654,
        type: 'private',
        first_name: 'Ghebi',
        username: 'ghebi',
      };

      message.text = 'makan siang 25000';

      update.message = message;

      const result = service.parse(update);

      expect(result).toEqual({
        updateId: 123456,
        messageId: 100,
        telegramUserId: 987654,
        chatId: 987654,
        chatType: 'private',
        text: 'makan siang 25000',
        messageDate: new Date(1758630000 * 1000),
        username: 'ghebi',
        firstName: 'Ghebi',
        lastName: undefined,
      });
    });

    it('should trim surrounding whitespace from message text', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123;

      const message = new TelegramMessageDto();

      message.message_id = 1;
      message.date = 1758630000;
      message.from = {
        id: 999,
        is_bot: false,
        first_name: 'Ghebi',
      };
      message.chat = {
        id: 999,
        type: 'private',
      };
      message.text = '   beli kopi 15000   ';

      update.message = message;

      const result = service.parse(update);

      expect(result?.text).toBe('beli kopi 15000');
    });

    it('should return null when update has no message', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      expect(service.parse(update)).toBeNull();
    });

    it('should return null when message has no text', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      const message = new TelegramMessageDto();

      message.message_id = 1;
      message.date = 1758630000;
      message.chat = {
        id: 987654,
        type: 'private',
      };

      update.message = message;

      expect(service.parse(update)).toBeNull();
    });

    it('should return null when message text is only whitespace', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      const message = new TelegramMessageDto();

      message.message_id = 1;
      message.date = 1758630000;
      message.chat = {
        id: 987654,
        type: 'private',
      };
      message.text = '   ';

      update.message = message;

      expect(service.parse(update)).toBeNull();
    });

    it('should return null when message sender is missing', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 123456;

      const message = new TelegramMessageDto();

      message.message_id = 1;
      message.date = 1758630000;
      message.chat = {
        id: 987654,
        type: 'private',
      };
      message.text = 'makan 20000';

      update.message = message;

      expect(service.parse(update)).toBeNull();
    });

    it('should preserve optional sender information', () => {
      const update = new TelegramUpdateDto();

      update.update_id = 555;

      const message = new TelegramMessageDto();

      message.message_id = 777;
      message.date = 1758630000;

      message.from = {
        id: 111,
        is_bot: false,
        first_name: 'Ghebi',
        last_name: 'Armando',
        username: 'ghebi',
      };

      message.chat = {
        id: 111,
        type: 'private',
      };

      message.text = 'transport 10000';

      update.message = message;

      const result = service.parse(update);

      expect(result).toEqual({
        updateId: 555,
        messageId: 777,
        telegramUserId: 111,
        chatId: 111,
        chatType: 'private',
        text: 'transport 10000',
        messageDate: new Date(1758630000 * 1000),
        username: 'ghebi',
        firstName: 'Ghebi',
        lastName: 'Armando',
      });
    });
  });
});
