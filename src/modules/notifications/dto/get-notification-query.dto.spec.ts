import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { NotificationChannel } from 'src/database/enums/notification-channel.enum';
import { NotificationStatus } from 'src/database/enums/notification-status.enum';

import {
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_DEFAULT_PAGE,
  NOTIFICATION_MAX_LIMIT,
} from '../notifications.constants';

import { GetNotificationsQueryDto } from './get-notification-query.dto';

describe('GetNotificationsQueryDto', () => {
  async function validateQuery(input: Record<string, unknown> = {}) {
    const dto = plainToInstance(GetNotificationsQueryDto, input);
    const errors = await validate(dto);

    return { dto, errors };
  }

  describe('status filter', () => {
    it.each(Object.values(NotificationStatus))(
      'should accept notification status %s',
      async (status) => {
        const { dto, errors } = await validateQuery({ status });

        expect(errors).toHaveLength(0);
        expect(dto.status).toBe(status);
      },
    );

    it('should reject an unsupported status', async () => {
      const { errors } = await validateQuery({
        status: 'ARCHIVED',
      });

      expect(errors.some((error) => error.property === 'status')).toBe(true);
    });

    it('should accept an omitted status filter', async () => {
      const { dto, errors } = await validateQuery();

      expect(errors).toHaveLength(0);
      expect(dto.status).toBeUndefined();
    });
  });

  describe('channel filter', () => {
    it.each(Object.values(NotificationChannel))(
      'should accept notification channel %s',
      async (channel) => {
        const { dto, errors } = await validateQuery({ channel });

        expect(errors).toHaveLength(0);
        expect(dto.channel).toBe(channel);
      },
    );

    it('should reject an unsupported channel', async () => {
      const { errors } = await validateQuery({
        channel: 'PUSH',
      });

      expect(errors.some((error) => error.property === 'channel')).toBe(true);
    });

    it('should accept an omitted channel filter', async () => {
      const { dto, errors } = await validateQuery();

      expect(errors).toHaveLength(0);
      expect(dto.channel).toBeUndefined();
    });
  });

  describe('page pagination', () => {
    it('should use the default page when omitted', async () => {
      const { dto, errors } = await validateQuery();

      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(NOTIFICATION_DEFAULT_PAGE);
    });

    it('should transform a numeric query string into a number', async () => {
      const { dto, errors } = await validateQuery({
        page: '3',
      });

      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(3);
      expect(typeof dto.page).toBe('number');
    });

    it.each(['0', '-1', '1.5', 'invalid', ''])(
      'should reject invalid page value %s',
      async (page) => {
        const { errors } = await validateQuery({ page });

        expect(errors.some((error) => error.property === 'page')).toBe(true);
      },
    );
  });

  describe('limit pagination', () => {
    it('should use the default limit when omitted', async () => {
      const { dto, errors } = await validateQuery();

      expect(errors).toHaveLength(0);
      expect(dto.limit).toBe(NOTIFICATION_DEFAULT_LIMIT);
    });

    it('should transform a numeric query string into a number', async () => {
      const { dto, errors } = await validateQuery({
        limit: '50',
      });

      expect(errors).toHaveLength(0);
      expect(dto.limit).toBe(50);
      expect(typeof dto.limit).toBe('number');
    });

    it('should accept the minimum limit', async () => {
      const { errors } = await validateQuery({
        limit: '1',
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept the maximum limit', async () => {
      const { dto, errors } = await validateQuery({
        limit: String(NOTIFICATION_MAX_LIMIT),
      });

      expect(errors).toHaveLength(0);
      expect(dto.limit).toBe(NOTIFICATION_MAX_LIMIT);
    });

    it.each(['0', '-1', '1.5', 'invalid', ''])(
      'should reject invalid limit value %s',
      async (limit) => {
        const { errors } = await validateQuery({ limit });

        expect(errors.some((error) => error.property === 'limit')).toBe(true);
      },
    );

    it('should reject a limit above the configured maximum', async () => {
      const { errors } = await validateQuery({
        limit: String(NOTIFICATION_MAX_LIMIT + 1),
      });

      expect(errors.some((error) => error.property === 'limit')).toBe(true);
    });
  });

  describe('combined filters', () => {
    it('should accept status, channel, page, and limit together', async () => {
      const { dto, errors } = await validateQuery({
        status: NotificationStatus.UNREAD,
        channel: NotificationChannel.IN_APP,
        page: '2',
        limit: '25',
      });

      expect(errors).toHaveLength(0);
      expect(dto).toEqual({
        status: NotificationStatus.UNREAD,
        channel: NotificationChannel.IN_APP,
        page: 2,
        limit: 25,
      });
    });

    it('should reject all invalid filters together', async () => {
      const { errors } = await validateQuery({
        status: 'ARCHIVED',
        channel: 'PUSH',
        page: '0',
        limit: String(NOTIFICATION_MAX_LIMIT + 1),
      });

      expect(errors).toHaveLength(4);

      expect(errors.map((error) => error.property)).toEqual(
        expect.arrayContaining(['status', 'channel', 'page', 'limit']),
      );
    });
  });
});
