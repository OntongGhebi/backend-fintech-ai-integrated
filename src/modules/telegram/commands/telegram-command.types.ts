export interface ParsedTelegramCommand {
  command: string;
  arguments: string[];
  rawText: string;
}

export interface TelegramCommandContext {
  userId: string;
  telegramAccountId: string;
  telegramUserId: bigint;
  chatId: bigint;
  messageId: bigint;
  arguments: string[];
  rawText: string;
}

export interface TelegramCommandHandler {
  readonly command: string;

  execute(context: TelegramCommandContext): Promise<void>;
}
