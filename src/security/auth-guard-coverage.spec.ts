import type { Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import { AccessTokenGuard } from '../modules/auth/guards/access-token.guard';
import { AuthController } from '../modules/auth/auth.controller';
import { AccountsController } from '../modules/accounts/accounts.controller';
import { AiController } from '../modules/ai/ai.controller';
import { BudgetAlertsController } from '../modules/budget-alerts/budget-alerts.controller';
import { BudgetsController } from '../modules/budgets/budgets.controller';
import { CategoriesController } from '../modules/categories/categories.controller';
import { DashboardController } from '../modules/dashboard/dashboard.controller';
import { FinancialAnalysisController } from '../modules/financial-analysis/financial-analysis.controller';
import { NotificationsController } from '../modules/notifications/notifications.controller';
import { BillingHistoryController } from '../modules/payments/billing-history.controller';
import { MidtransWebhookController } from '../modules/payments/midtrans-webhook.controller';
import { PaymentCheckoutController } from '../modules/payments/payment-checkout.controller';
import { PaymentsController } from '../modules/payments/payments.controller';
import { PlansController } from '../modules/plans/plans.controller';
import { RecurringTransactionsController } from '../modules/recurring-transactions/recurring-transactions.controller';
import { ReportController } from '../modules/reports/report.controller';
import { SubscriptionsController } from '../modules/subscriptions/subscriptions.controller';
import { TelegramController } from '../modules/telegram/telegram.controller';
import { TelegramWebhookGuard } from '../modules/telegram/guards/telegram-webhook.guard';
import { TransactionsController } from '../modules/transactions/transactions.controller';
import { UsersController } from '../modules/users/users.controller';
import { HealthController } from '../health/health.controller';

type ControllerClass = Type<unknown>;

function getRouteMethods(controller: ControllerClass): string[] {
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype).filter((methodName) => {
    if (methodName === 'constructor') {
      return false;
    }

    const handler = prototype[methodName];

    if (typeof handler !== 'function') {
      return false;
    }

    return (
      Reflect.hasMetadata(PATH_METADATA, handler) &&
      Reflect.hasMetadata(METHOD_METADATA, handler)
    );
  });
}

function getClassGuards(controller: ControllerClass): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
}

function getMethodGuards(
  controller: ControllerClass,
  methodName: string,
): unknown[] {
  const handler = (controller.prototype as Record<string, unknown>)[methodName];

  if (typeof handler !== 'function') {
    throw new Error(
      `${controller.name}.${methodName} is not a controller method`,
    );
  }

  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

describe('Authentication and authorization guard coverage', () => {
  describe('class-level protected controllers', () => {
    const protectedControllers: Array<readonly [string, ControllerClass]> = [
      ['AccountsController', AccountsController],
      ['AiController', AiController],
      ['BudgetAlertsController', BudgetAlertsController],
      ['BudgetsController', BudgetsController],
      ['CategoriesController', CategoriesController],
      ['DashboardController', DashboardController],
      ['FinancialAnalysisController', FinancialAnalysisController],
      ['NotificationsController', NotificationsController],
      ['BillingHistoryController', BillingHistoryController],
      ['PaymentCheckoutController', PaymentCheckoutController],
      ['PaymentsController', PaymentsController],
      ['RecurringTransactionsController', RecurringTransactionsController],
      ['ReportController', ReportController],
      ['SubscriptionsController', SubscriptionsController],
      ['TransactionsController', TransactionsController],
    ];

    it.each(protectedControllers)(
      '%s requires AccessTokenGuard for every route',
      (_name, controller) => {
        expect(getClassGuards(controller)).toContain(AccessTokenGuard);

        const routeMethods = getRouteMethods(controller);

        expect(routeMethods.length).toBeGreaterThan(0);

        for (const methodName of routeMethods) {
          expect(getMethodGuards(controller, methodName)).not.toContain(
            AccessTokenGuard,
          );
        }
      },
    );
  });

  describe('method-level protected controllers', () => {
    it('protects every UsersController route', () => {
      const routeMethods = getRouteMethods(UsersController);

      expect(routeMethods.length).toBeGreaterThan(0);

      for (const methodName of routeMethods) {
        expect(getMethodGuards(UsersController, methodName)).toContain(
          AccessTokenGuard,
        );
      }
    });

    it.each(['logout', 'me', 'getProtected'])(
      'protects AuthController.%s',
      (methodName) => {
        expect(getMethodGuards(AuthController, methodName)).toContain(
          AccessTokenGuard,
        );
      },
    );

    it.each(['register', 'verifyEmail', 'login', 'refresh'])(
      'keeps AuthController.%s available without an access token',
      (methodName) => {
        expect(getMethodGuards(AuthController, methodName)).not.toContain(
          AccessTokenGuard,
        );
      },
    );

    it('protects Telegram account-management routes', () => {
      for (const methodName of [
        'createLinkCode',
        'getLinkedAccounts',
        'unlinkAccount',
      ]) {
        expect(getMethodGuards(TelegramController, methodName)).toContain(
          AccessTokenGuard,
        );
      }
    });

    it('protects the Telegram webhook with its dedicated guard', () => {
      expect(getMethodGuards(TelegramController, 'handleWebhook')).toContain(
        TelegramWebhookGuard,
      );

      expect(
        getMethodGuards(TelegramController, 'handleWebhook'),
      ).not.toContain(AccessTokenGuard);
    });
  });

  describe('intentionally public controllers', () => {
    it.each([
      ['HealthController', HealthController],
      ['PlansController', PlansController],
    ] as const)('%s does not require AccessTokenGuard', (_name, controller) => {
      expect(getClassGuards(controller)).not.toContain(AccessTokenGuard);

      for (const methodName of getRouteMethods(controller)) {
        expect(getMethodGuards(controller, methodName)).not.toContain(
          AccessTokenGuard,
        );
      }
    });

    it('keeps the Midtrans webhook outside user access-token authentication', () => {
      expect(getClassGuards(MidtransWebhookController)).not.toContain(
        AccessTokenGuard,
      );

      expect(
        getMethodGuards(
          MidtransWebhookController,
          'receiveMidtransNotification',
        ),
      ).not.toContain(AccessTokenGuard);
    });
  });
});
