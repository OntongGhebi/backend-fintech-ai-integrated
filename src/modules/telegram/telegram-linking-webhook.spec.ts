import { ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramAccountService } from './services/telegram-account.service';
import { TelegramIncomingMessageService } from './services/telegram-incoming-message.service';
import { TelegramMessageProcessingService } from './services/telegram-message-processing.service';
import { TelegramService } from './services/telegram.service';
import { TelegramUpdateParserService } from './services/telegram-update-parser.service';

describe('TelegramController linking webhook', () => {
  let controller: TelegramController;

  let telegramService: {
    handleUpdate: jest.Mock;
    sendMessage: jest.Mock;
  };

  let telegramAccountService: {
    completeLink: jest.Mock;
  };

  let telegramIncomingMessageService: {
    persist: jest.Mock;
  };

  let telegramUpdateParserService: {
    parse: jest.Mock;
  };

  let telegramMessageProcessingService: {
    process: jest.Mock;
  };

  const parsedMessage = {
    updateId: 100,
    messageId: 200,
    telegramUserId: 123456789,
    chatId: 987654321,
    chatType: 'private' as const,
    text: '/start 12345678',
    messageDate: new Date(),
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
  };

  const update = {
    update_id: 100,
    message: {
      message_id: 200,
      from: {
        id: 123456789,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: {
        id: 987654321,
        type: 'private',
      },
      date: 1750000000,
      text: '/start 12345678',
    },
  };

  beforeEach(() => {
    telegramService = {
      handleUpdate: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    };

    telegramAccountService = {
      completeLink: jest.fn().mockResolvedValue({
        id: 'telegram-account-id',
      }),
    };

    telegramIncomingMessageService = {
      persist: jest.fn(),
    };

    telegramUpdateParserService = {
      parse: jest.fn().mockReturnValue(parsedMessage),
    };

    telegramMessageProcessingService = {
      process: jest.fn(),
    };

    controller = new TelegramController(
      telegramService as unknown as TelegramService,
      telegramUpdateParserService as unknown as TelegramUpdateParserService,
      telegramAccountService as unknown as TelegramAccountService,
      telegramIncomingMessageService as unknown as TelegramIncomingMessageService,
      telegramMessageProcessingService as unknown as TelegramMessageProcessingService,
    );
  });

  it('links an unlinked Telegram sender using /start CODE', async () => {
    await expect(controller.handleWebhook(update as never)).resolves.toEqual({
      ok: true,
    });

    expect(telegramAccountService.completeLink).toHaveBeenCalledWith(
      {
        telegramUserId: BigInt(parsedMessage.telegramUserId),
        telegramUsername: parsedMessage.username,
        firstName: parsedMessage.firstName,
        lastName: parsedMessage.lastName,
      },
      '12345678',
    );

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: parsedMessage.chatId,
      text: expect.stringContaining('berhasil dihubungkan'),
    });

    expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();
    expect(telegramMessageProcessingService.process).not.toHaveBeenCalled();
  });

  it('supports /start@botname CODE syntax', async () => {
    telegramUpdateParserService.parse.mockReturnValue({
      ...parsedMessage,
      text: '/start@FintechAIBot 12345678',
    });

    await controller.handleWebhook(update as never);

    expect(telegramAccountService.completeLink).toHaveBeenCalledWith(
      expect.any(Object),
      '12345678',
    );
  });

  it('does not attempt linking from a group chat', async () => {
    telegramUpdateParserService.parse.mockReturnValue({
      ...parsedMessage,
      chatType: 'group',
    });

    await expect(controller.handleWebhook(update as never)).resolves.toEqual({
      ok: true,
    });

    expect(telegramAccountService.completeLink).not.toHaveBeenCalled();
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();
  });

  it('responds when /start is sent without a code', async () => {
    telegramUpdateParserService.parse.mockReturnValue({
      ...parsedMessage,
      text: '/start',
    });

    await controller.handleWebhook(update as never);

    expect(telegramAccountService.completeLink).not.toHaveBeenCalled();

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: parsedMessage.chatId,
      text: expect.stringContaining('buat kode linking'),
    });

    expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();
  });

  it('responds when the linking code is invalid or expired', async () => {
    telegramAccountService.completeLink.mockRejectedValue(
      new NotFoundException('Telegram linking code is invalid or expired'),
    );

    await expect(controller.handleWebhook(update as never)).resolves.toEqual({
      ok: true,
    });

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: parsedMessage.chatId,
      text: expect.stringContaining('tidak valid atau sudah kedaluwarsa'),
    });

    expect(telegramIncomingMessageService.persist).not.toHaveBeenCalled();
  });

  it('responds when the Telegram account is already linked to another user', async () => {
    telegramAccountService.completeLink.mockRejectedValue(
      new ConflictException('Telegram account is already linked'),
    );

    await expect(controller.handleWebhook(update as never)).resolves.toEqual({
      ok: true,
    });

    expect(telegramService.sendMessage).toHaveBeenCalledWith({
      chatId: parsedMessage.chatId,
      text: expect.stringContaining('sudah terhubung'),
    });
  });

  it('propagates unexpected linking failures for webhook retry', async () => {
    telegramAccountService.completeLink.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(controller.handleWebhook(update as never)).rejects.toThrow(
      'Database unavailable',
    );
  });

  it('does not treat ordinary messages as linking commands', async () => {
    telegramUpdateParserService.parse.mockReturnValue({
      ...parsedMessage,
      text: 'makan siang 25000',
    });

    telegramIncomingMessageService.persist.mockResolvedValue(null);

    await controller.handleWebhook(update as never);

    expect(telegramAccountService.completeLink).not.toHaveBeenCalled();
    expect(telegramIncomingMessageService.persist).toHaveBeenCalled();
  });
});
