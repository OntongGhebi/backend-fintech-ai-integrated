import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';

export interface GetNotificationsOptions {
  status?: NotificationStatus;
  channel?: NotificationChannel;
  page: number;
  limit: number;
}

export interface NotificationPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedNotifications<T> {
  data: T[];
  meta: NotificationPaginationMeta;
}
