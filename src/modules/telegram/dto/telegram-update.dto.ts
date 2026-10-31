import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TelegramUserDto {
  @ApiProperty({
    example: 987654321,
  })
  @IsInt()
  id!: number;

  @ApiProperty({
    example: false,
  })
  @IsBoolean()
  is_bot!: boolean;

  @ApiProperty({
    example: 'Ghebi',
  })
  @IsString()
  first_name!: string;

  @ApiPropertyOptional({
    example: 'Armando',
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({
    example: 'ghebi',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    example: 'id',
  })
  @IsOptional()
  @IsString()
  language_code?: string;
}

export class TelegramChatDto {
  @ApiProperty({
    example: 987654321,
  })
  @IsInt()
  id!: number;

  @ApiProperty({
    example: 'private',
    enum: ['private', 'group', 'supergroup', 'channel'],
  })
  @IsString()
  @IsIn(['private', 'group', 'supergroup', 'channel'])
  type!: 'private' | 'group' | 'supergroup' | 'channel';

  @ApiPropertyOptional({
    example: 'Ghebi Finance',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'ghebi',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    example: 'Ghebi',
  })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({
    example: 'Armando',
  })
  @IsOptional()
  @IsString()
  last_name?: string;
}

/**
 * Telegram message entity.
 *
 * Telegram uses entities to describe special parts of message text,
 * such as bot commands, URLs, mentions, formatting, and custom emoji.
 *
 * offset and length are measured in UTF-16 code units.
 */
export class TelegramMessageEntityDto {
  @ApiProperty({
    example: 'bot_command',
    enum: [
      'mention',
      'hashtag',
      'cashtag',
      'bot_command',
      'url',
      'email',
      'phone_number',
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'spoiler',
      'blockquote',
      'expandable_blockquote',
      'code',
      'pre',
      'text_link',
      'text_mention',
      'custom_emoji',
    ],
  })
  @IsString()
  @IsIn([
    'mention',
    'hashtag',
    'cashtag',
    'bot_command',
    'url',
    'email',
    'phone_number',
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'spoiler',
    'blockquote',
    'expandable_blockquote',
    'code',
    'pre',
    'text_link',
    'text_mention',
    'custom_emoji',
  ])
  type!: string;

  @ApiProperty({
    example: 0,
    description: 'Entity offset measured in UTF-16 code units.',
  })
  @IsInt()
  @Min(0)
  offset!: number;

  @ApiProperty({
    example: 6,
    description: 'Entity length measured in UTF-16 code units.',
  })
  @IsInt()
  @IsPositive()
  length!: number;

  @ApiPropertyOptional({
    example: 'https://example.com',
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({
    type: TelegramUserDto,
    description: 'User associated with a text_mention entity.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramUserDto)
  user?: TelegramUserDto;

  @ApiPropertyOptional({
    example: 'typescript',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    example: '5368324170671202286',
  })
  @IsOptional()
  @IsString()
  custom_emoji_id?: string;
}

export class TelegramMessageDto {
  @ApiProperty({
    example: 123,
  })
  @IsInt()
  message_id!: number;

  @ApiPropertyOptional({
    type: TelegramUserDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramUserDto)
  from?: TelegramUserDto;

  @ApiProperty({
    type: TelegramChatDto,
  })
  @ValidateNested()
  @Type(() => TelegramChatDto)
  chat!: TelegramChatDto;

  @ApiProperty({
    example: 1758630000,
  })
  @IsInt()
  date!: number;

  @ApiPropertyOptional({
    example: 'makan siang 25000',
  })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    type: [TelegramMessageEntityDto],
    description:
      'Special entities in the message text, including bot commands.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelegramMessageEntityDto)
  entities?: TelegramMessageEntityDto[];
}

export class TelegramUpdateDto {
  @ApiProperty({
    example: 123456789,
  })
  @IsInt()
  update_id!: number;

  @ApiPropertyOptional({
    type: TelegramMessageDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramMessageDto)
  message?: TelegramMessageDto;

  /**
   * Telegram supports many update types.
   *
   * callback_query is currently not processed by the
   * application, but it must still be accepted at the
   * webhook boundary so unsupported Telegram updates
   * can be safely ignored by TelegramUpdateParserService.
   */
  @ApiPropertyOptional({
    description:
      'Telegram callback query. Currently accepted but not processed.',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  callback_query?: Record<string, unknown>;
}
