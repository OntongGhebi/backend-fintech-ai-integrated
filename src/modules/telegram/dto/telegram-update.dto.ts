import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
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
}
