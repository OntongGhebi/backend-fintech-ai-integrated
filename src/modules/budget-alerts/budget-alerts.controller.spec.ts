import { Test, TestingModule } from '@nestjs/testing';
import { BudgetAlertsController } from './budget-alerts.controller';

describe('BudgetAlertsController', () => {
  let controller: BudgetAlertsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BudgetAlertsController],
    }).compile();

    controller = module.get<BudgetAlertsController>(BudgetAlertsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
