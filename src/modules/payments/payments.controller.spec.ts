import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BillingHistoryService } from './billing-history.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const paymentsService = {
    findManyByUserId: jest.fn(),
    findById: jest.fn(),
  };

  const billingHistoryService = {
    getPaymentHistory: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new PaymentsController(
      paymentsService as unknown as PaymentsService,
      billingHistoryService as unknown as BillingHistoryService,
    );
  });

  describe('getPaymentHistory', () => {
    it('should preserve the legacy payment history contract', async () => {
      const userId = 'user-123';
      const query = {
        page: 2,
        limit: 20,
      };
      const response = {
        data: [],
        meta: {
          page: 2,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      };

      billingHistoryService.getPaymentHistory.mockResolvedValue(response);

      await expect(
        controller.getPaymentHistory(userId, query),
      ).resolves.toStrictEqual(response);

      expect(billingHistoryService.getPaymentHistory).toHaveBeenCalledWith(
        userId,
        query,
      );
      expect(paymentsService.findManyByUserId).not.toHaveBeenCalled();
    });
  });

  describe('findMine', () => {
    it('should use the standard payment list service and preserve status filters', async () => {
      const userId = 'user-123';
      const query = {
        page: 1,
        limit: 10,
        status: 'PAID',
      };
      const response = {
        data: [],
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 0,
      };

      paymentsService.findManyByUserId.mockResolvedValue(response);

      await expect(controller.findMine(userId, query as never)).resolves.toBe(
        response,
      );

      expect(paymentsService.findManyByUserId).toHaveBeenCalledWith(
        userId,
        query,
      );
      expect(billingHistoryService.getPaymentHistory).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should scope payment detail lookup to the authenticated user', async () => {
      const userId = 'user-123';
      const paymentId = '11111111-1111-4111-8111-111111111111';
      const response = {
        id: paymentId,
      };

      paymentsService.findById.mockResolvedValue(response);

      await expect(controller.findById(userId, paymentId)).resolves.toBe(
        response,
      );

      expect(paymentsService.findById).toHaveBeenCalledWith(paymentId, userId);
    });
  });
});
