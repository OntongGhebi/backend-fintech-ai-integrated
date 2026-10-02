export interface ParsedTelegramMessage {
  updateId: number;
  messageId: number;
  telegramUserId: number;
  chatId: number;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  text: string;
  messageDate: Date;
  username?: string;
  firstName?: string;
  lastName?: string;
}
