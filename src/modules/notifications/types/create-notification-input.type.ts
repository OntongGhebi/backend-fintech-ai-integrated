import { Prisma } from '../../../../generated/prisma/client';
import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  channel: NotificationChannel;
  status?: NotificationStatus;
  idempotencyKey?: string | null;
  data?: Prisma.InputJsonValue | null;
  actionUrl?: string | null;
}
