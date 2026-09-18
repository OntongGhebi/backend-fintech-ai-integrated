import { Test, TestingModule } from '@nestjs/testing';
import { BudgetAlertsService } from './budget-alerts.service';

describe('BudgetAlertsService', () => {
  let service: BudgetAlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BudgetAlertsService],
    }).compile();

    service = module.get<BudgetAlertsService>(BudgetAlertsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
