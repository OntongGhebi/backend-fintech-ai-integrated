export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATION_DELIVERY_JOB = 'notification-delivery';
export const NOTIFICATION_DEFAULT_PAGE = 1;
export const NOTIFICATION_DEFAULT_LIMIT = 20;
export const NOTIFICATION_MAX_LIMIT = 100;
export const NOTIFICATION_JOB_ATTEMPTS = 3;
export const NOTIFICATION_JOB_BACKOFF_DELAY_MS = 5_000;
export const NOTIFICATION_JOB_RETENTION = {
  completed: 100,
  failed: 100,
} as const;
