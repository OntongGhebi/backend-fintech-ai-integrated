import { BadRequestException } from '@nestjs/common';

import { FinancialWellBeingService } from './financial-well-being.service';
import { FinancialAnalysisService } from './financial-analysis.service';

describe('FinancialWellBeingService month validation', () => {
  let service: FinancialWellBeingService;

  const financialAnalysisServiceMock = {
    getOverview: jest.fn(),
  };

  const prismaMock = {
    budgetRecommendation: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new FinancialWellBeingService(
      prismaMock as any,
      financialAnalysisServiceMock as unknown as FinancialAnalysisService,
    );
  });

  it.each(['2026-1', '2026-00', '2026-13', 'invalid', '2026/12'])(
    'rejects invalid month value %s with BadRequestException',
    async (month) => {
      await expect(
        service.getDashboard('user-1', month),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(financialAnalysisServiceMock.getOverview).not.toHaveBeenCalled();
      expect(prismaMock.budgetRecommendation.groupBy).not.toHaveBeenCalled();
      expect(prismaMock.budgetRecommendation.findMany).not.toHaveBeenCalled();
    },
  );
});
