import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'BUDGET_ALERT' })
  type!: string;

  @ApiProperty({ example: 'Budget hampir habis' })
  title!: string;

  @ApiProperty({
    example: 'Pengeluaran Anda telah mencapai 80% dari anggaran.',
  })
  message!: string;

  @ApiProperty({ enum: NotificationChannel })
  channel!: NotificationChannel;

  @ApiProperty({ enum: NotificationStatus })
  status!: NotificationStatus;

  @ApiPropertyOptional({
    description: 'Informasi terstruktur untuk menampilkan detail notifikasi.',
    type: Object,
    nullable: true,
    additionalProperties: true,
  })
  data!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Internal frontend route yang terkait dengan notifikasi.',
    example: '/financial-well-being',
    nullable: true,
  })
  actionUrl!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
