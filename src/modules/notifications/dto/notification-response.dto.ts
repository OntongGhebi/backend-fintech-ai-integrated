import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';

export class NotificationResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '9c7d6e5f-4a3b-2c1d-0e9f-8a7b6c5d4e3f',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: '1f4e7a0b-3c2d-4e5f-8a9b-0c1d2e3f4a5b',
  })
  userId!: string;

  @ApiProperty({
    example: 'BUDGET_ALERT',
  })
  type!: string;

  @ApiProperty({
    example: 'Budget hampir habis',
  })
  title!: string;

  @ApiProperty({
    example: 'Pengeluaran Anda telah mencapai 80% dari anggaran.',
  })
  message!: string;

  @ApiProperty({
    enum: NotificationChannel,
    example: NotificationChannel.IN_APP,
  })
  channel!: NotificationChannel;

  @ApiProperty({
    enum: NotificationStatus,
    example: NotificationStatus.UNREAD,
  })
  status!: NotificationStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
  })
  readAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-09T08:00:00.000Z',
  })
  createdAt!: Date;
}
