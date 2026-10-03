import { AIIntentClassifierService } from './ai-intent-classifier.service';
import { AITransactionDraftService } from './ai-transaction-draft.service';
import { AITransactionEntityExtractorService } from './ai-transaction-entity-extractor.service';
import { AITransactionResolutionService } from './ai-transaction-resolution.service';
import { AITransactionIntelligenceService } from './ai-transaction-intelligence.service';

describe('AITransactionIntelligenceService', () => {
  let service: AITransactionIntelligenceService;

  const classifierService = {
    classify: jest.fn(),
  };

  const extractorService = {
    extract: jest.fn(),
  };

  const resolutionService = {
    resolve: jest.fn(),
  };

  const draftService = {
    buildDraft: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AITransactionIntelligenceService(
      classifierService as unknown as AIIntentClassifierService,
      extractorService as unknown as AITransactionEntityExtractorService,
      resolutionService as unknown as AITransactionResolutionService,
      draftService as unknown as AITransactionDraftService,
    );
  });

  it('should reject empty text', async () => {
    await expect(
      service.analyze({
        userId: 'user-id',
        text: '   ',
      }),
    ).rejects.toThrow('AI transaction intelligence text cannot be empty');

    expect(classifierService.classify).not.toHaveBeenCalled();
  });

  it('should return unsupported for non-transaction intent', async () => {
    classifierService.classify.mockResolvedValue({
      intent: 'GENERAL_CHAT',
      confidence: 0.95,
    });

    const result = await service.analyze({
      userId: 'user-id',
      text: 'halo',
    });

    expect(result).toEqual({
      status: 'UNSUPPORTED',
      text: 'halo',
      intent: {
        intent: 'GENERAL_CHAT',
        confidence: 0.95,
      },
    });

    expect(extractorService.extract).not.toHaveBeenCalled();
  });

  it('should return needs information when draft is not ready', async () => {
    const entities = {
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountHint: null,
      categoryHint: 'Makanan',
      destinationAccountHint: null,
    };

    const resolution = {
      account: {
        status: 'NOT_REQUESTED',
        hint: null,
        account: null,
        candidates: [],
      },
      destinationAccount: {
        status: 'NOT_REQUESTED',
        hint: null,
        account: null,
        candidates: [],
      },
      category: {
        status: 'RESOLVED',
        hint: 'Makanan',
        category: {
          id: 'category-id',
          name: 'Makanan',
          type: 'EXPENSE',
        },
        candidates: [],
      },
      ready: false,
    };

    const draft = {
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountId: null,
      categoryId: 'category-id',
      destinationAccountId: null,
      currency: 'IDR',
      status: 'NEEDS_RESOLUTION',
      ready: false,
      unresolvedFields: ['account'],
    };

    classifierService.classify.mockResolvedValue({
      intent: 'CREATE_TRANSACTION',
      confidence: 0.96,
    });

    extractorService.extract.mockResolvedValue(entities);

    resolutionService.resolve.mockResolvedValue(resolution);

    draftService.buildDraft.mockReturnValue(draft);

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000',
    });

    expect(result).toEqual({
      status: 'NEEDS_INFORMATION',
      text: 'beli makan 25000',
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.96,
      },
      entities,
      resolution,
      draft,
    });
  });

  it('should return ready when the transaction draft is ready', async () => {
    const entities = {
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountHint: 'BCA',
      categoryHint: 'Makanan',
      destinationAccountHint: null,
    };

    const resolution = {
      account: {
        status: 'RESOLVED',
        hint: 'BCA',
        account: {
          id: 'account-id',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
        candidates: [],
      },
      destinationAccount: {
        status: 'NOT_REQUESTED',
        hint: null,
        account: null,
        candidates: [],
      },
      category: {
        status: 'RESOLVED',
        hint: 'Makanan',
        category: {
          id: 'category-id',
          name: 'Makanan',
          type: 'EXPENSE',
        },
        candidates: [],
      },
      ready: true,
    };

    const draft = {
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountId: 'account-id',
      categoryId: 'category-id',
      destinationAccountId: null,
      currency: 'IDR',
      status: 'READY',
      ready: true,
      unresolvedFields: [],
    };

    classifierService.classify.mockResolvedValue({
      intent: 'CREATE_TRANSACTION',
      confidence: 0.98,
    });

    extractorService.extract.mockResolvedValue(entities);

    resolutionService.resolve.mockResolvedValue(resolution);

    draftService.buildDraft.mockReturnValue(draft);

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000 dari BCA kategori Makanan',
    });

    expect(result).toEqual({
      status: 'READY',
      text: 'beli makan 25000 dari BCA kategori Makanan',
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.98,
      },
      entities,
      resolution,
      draft,
    });
  });

  it('should return AI_UNAVAILABLE when AI is disabled or not configured', async () => {
    classifierService.classify.mockRejectedValue(
      new Error('AI service is disabled'),
    );

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000',
    });

    expect(result).toEqual({
      status: 'ERROR',
      text: 'beli makan 25000',
      errorCode: 'AI_UNAVAILABLE',
    });
  });

  it('should return AI_UNAVAILABLE when AI provider is not configured', async () => {
    classifierService.classify.mockRejectedValue(
      new Error('AI provider is not configured'),
    );

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000',
    });

    expect(result).toEqual({
      status: 'ERROR',
      text: 'beli makan 25000',
      errorCode: 'AI_UNAVAILABLE',
    });
  });

  it('should return AI_TIMEOUT when AI provider times out', async () => {
    classifierService.classify.mockRejectedValue(
      new Error('AI provider request timed out'),
    );

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000',
    });

    expect(result).toEqual({
      status: 'ERROR',
      text: 'beli makan 25000',
      errorCode: 'AI_TIMEOUT',
    });
  });

  it('should return AI_PROVIDER_ERROR for provider failures', async () => {
    classifierService.classify.mockRejectedValue(
      new Error('AI provider request failed'),
    );

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000',
    });

    expect(result).toEqual({
      status: 'ERROR',
      text: 'beli makan 25000',
      errorCode: 'AI_PROVIDER_ERROR',
    });
  });

  it('should return AI_PROVIDER_ERROR for unknown errors', async () => {
    classifierService.classify.mockRejectedValue(
      new Error('Unexpected failure'),
    );

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000',
    });

    expect(result).toEqual({
      status: 'ERROR',
      text: 'beli makan 25000',
      errorCode: 'AI_PROVIDER_ERROR',
    });
  });
});
