import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';

import { TelegramAccountService } from './services/telegram-account.service';
import { TelegramIncomingMessageService } from './services/telegram-incoming-message.service';
import { TelegramMessageProcessingService } from './services/telegram-message-processing.service';
import { TelegramService } from './services/telegram.service';
import { TelegramUpdateParserService } from './services/telegram-update-parser.service';
import { TelegramWebhookGuard } from './guards/telegram-webhook.guard';
import { TelegramUpdateDto } from './dto/telegram-update.dto';

import { ParsedTelegramMessage } from './types/telegram-parser.types';

const TELEGRAM_LINK_CODE_PATTERN = /^\d{8}$/;

const TELEGRAM_START_COMMAND_PATTERN = /^\/start(?:@\w+)?(?:\s+(\d{8}))?\s*$/i;

const TELEGRAM_START_COMMAND_PREFIX = /^\/start(?:@\w+)?(?:\s|$)/i;

@Controller('telegram')
@ApiTags('Telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly telegramUpdateParserService: TelegramUpdateParserService,
    private readonly telegramAccountService: TelegramAccountService,
    private readonly telegramIncomingMessageService: TelegramIncomingMessageService,
    private readonly telegramMessageProcessingService: TelegramMessageProcessingService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TelegramWebhookGuard)
  @ApiOperation({
    summary: 'Receive Telegram bot webhook updates',
  })
  @ApiHeader({
    name: 'X-Telegram-Bot-Api-Secret-Token',
    description: 'Webhook secret configured in TELEGRAM_WEBHOOK_SECRET.',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Telegram update received successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid Telegram webhook secret',
  })
  async handleWebhook(
    @Body() update: TelegramUpdateDto,
  ): Promise<{ ok: boolean }> {
    const parsedMessage = this.telegramUpdateParserService.parse(update);

    if (!parsedMessage) {
      this.telegramService.handleUpdate(null);

      return { ok: true };
    }

    // Process account linking before normal message persistence.
    // An unlinked Telegram user cannot reach the normal transaction
    // pipeline until this step has successfully linked the account.
    if (this.isStartCommand(parsedMessage.text)) {
      await this.handleStartCommand(parsedMessage);

      this.telegramService.handleUpdate(parsedMessage);

      return { ok: true };
    }

    const persistedMessage =
      await this.telegramIncomingMessageService.persist(parsedMessage);

    if (!persistedMessage) {
      this.telegramService.handleUpdate(parsedMessage);

      return { ok: true };
    }

    if (!persistedMessage.created) {
      this.telegramService.handleUpdate(parsedMessage);

      return { ok: true };
    }

    await this.telegramMessageProcessingService.process({
      messageId: persistedMessage.id,
      userId: persistedMessage.userId,
      telegramAccountId: persistedMessage.telegramAccountId,
      telegramUserId: persistedMessage.telegramUserId,
      chatId: persistedMessage.chatId,
      telegramMessageId: persistedMessage.telegramMessageId,
      messageType: persistedMessage.messageType,
      content: persistedMessage.content,
    });

    this.telegramService.handleUpdate(parsedMessage);

    return { ok: true };
  }

  private isStartCommand(text: string): boolean {
    return TELEGRAM_START_COMMAND_PREFIX.test(text.trim());
  }

  private async handleStartCommand(
    message: ParsedTelegramMessage,
  ): Promise<void> {
    // Linking must only be initiated in a private chat.
    if (message.chatType !== 'private') {
      this.logger.warn(
        `Rejected Telegram linking command outside private chat: chat=${message.chatId}`,
      );

      return;
    }

    const match = message.text.trim().match(TELEGRAM_START_COMMAND_PATTERN);

    if (!match) {
      await this.telegramService.sendMessage({
        chatId: message.chatId,
        text:
          'Format perintah linking tidak valid.\n\n' +
          'Silakan gunakan:\n' +
          '/start KODE_LINKING\n\n' +
          'Dapatkan kode linking melalui aplikasi Fintech AI.',
      });

      return;
    }

    const code = match[1];

    if (!code || !TELEGRAM_LINK_CODE_PATTERN.test(code)) {
      await this.telegramService.sendMessage({
        chatId: message.chatId,
        text:
          'Halo! Untuk menghubungkan akun Telegram, silakan buat kode linking terlebih dahulu melalui aplikasi Fintech AI, kemudian kirim:\n\n' +
          '/start KODE_LINKING',
      });

      return;
    }

    try {
      const linkedAccount = await this.telegramAccountService.completeLink(
        {
          telegramUserId: BigInt(message.telegramUserId),
          telegramUsername: message.username,
          firstName: message.firstName,
          lastName: message.lastName,
        },
        code,
      );

      this.logger.log(
        `Telegram account linked successfully: telegramUserId=${message.telegramUserId}, accountId=${linkedAccount.id}`,
      );

      await this.telegramService.sendMessage({
        chatId: message.chatId,
        text:
          '🎉 Akun Telegram berhasil dihubungkan!\n\n' +
          `Nama: ${message.firstName ?? 'Pengguna'}\n` +
          `Username: ${message.username ? `@${message.username}` : 'Tidak tersedia'}\n\n` +
          'Sekarang Anda dapat mengirim pesan transaksi langsung melalui Telegram.\n\n' +
          'Contoh:\n' +
          'makan siang 25000\n' +
          'gaji 5000000\n\n' +
          'Pastikan detail transaksi sudah benar sebelum melakukan konfirmasi.',
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        await this.telegramService.sendMessage({
          chatId: message.chatId,
          text:
            '❌ Kode linking tidak valid atau sudah kedaluwarsa.\n\n' +
            'Silakan buat kode baru melalui aplikasi Fintech AI dan coba kembali.',
        });

        return;
      }

      if (error instanceof ConflictException) {
        await this.telegramService.sendMessage({
          chatId: message.chatId,
          text:
            '⚠️ Akun Telegram ini sudah terhubung dengan akun aplikasi lain.\n\n' +
            'Jika Anda merasa ini adalah kesalahan, silakan periksa akun yang sedang digunakan atau hubungi administrator.',
        });

        return;
      }

      // Unexpected Redis/database/Telegram errors must propagate
      // so the webhook can be retried instead of silently discarded.
      throw error;
    }
  }

  @Post('link')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a Telegram account linking code',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Telegram linking code generated successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  async createLinkCode(@CurrentUser() userId: string) {
    return this.telegramAccountService.createLinkCode(userId);
  }

  @Get('accounts')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get linked Telegram accounts',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Linked Telegram accounts retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  async getLinkedAccounts(@CurrentUser() userId: string) {
    return this.telegramAccountService.findByUserId(userId);
  }

  @Delete('accounts/:telegramAccountId')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlink a Telegram account',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Telegram account unlinked successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  async unlinkAccount(
    @CurrentUser() userId: string,
    @Param('telegramAccountId') telegramAccountId: string,
  ) {
    return this.telegramAccountService.unlink(userId, telegramAccountId);
  }
}
