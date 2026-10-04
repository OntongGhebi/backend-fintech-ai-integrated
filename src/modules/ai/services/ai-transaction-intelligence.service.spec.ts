import { AIIntentClassifierService } from './ai-intent-classifier.service';
import { AITransactionDraftService } from './ai-transaction-draft.service';
import { AITransactionEntityExtractorService } from './ai-transaction-entity-extractor.service';
import { AITransactionResolutionService } from './ai-transaction-resolution.service';
import { AITransactionValidationService } from './ai-transaction-validation.service';
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

  const validationService = {
    validateIntent: jest.fn(),
    normalizeEntities: jest.fn(),
    validateResolution: jest.fn(),
    validateDraft: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AITransactionIntelligenceService(
      classifierService as unknown as AIIntentClassifierService,
      extractorService as unknown as AITransactionEntityExtractorService,
      resolutionService as unknown as AITransactionResolutionService,
      draftService as unknown as AITransactionDraftService,
      validationService as unknown as AITransactionValidationService,
    );

    validationService.validateIntent.mockReturnValue({
      valid: true,
    });

    validationService.normalizeEntities.mockImplementation((entities) => ({
      valid: true,
      value: entities,
    }));

    validationService.validateResolution.mockImplementation(
      (entities, resolution) => ({
        valid: true,
        value: resolution,
      }),
    );

    validationService.validateDraft.mockImplementation(
      (entities, resolution, draft) => ({
        valid: true,
        value: draft,
      }),
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

    expect(validationService.validateIntent).not.toHaveBeenCalled();
  });

  it('should reject a transaction intent below the confidence threshold', async () => {
    classifierService.classify.mockResolvedValue({
      intent: 'CREATE_TRANSACTION',
      confidence: 0.5,
    });

    validationService.validateIntent.mockReturnValue({
      valid: false,
      reason: 'AI intent confidence is below the minimum threshold of 0.8',
    });

    const result = await service.analyze({
      userId: 'user-id',
      text: 'mungkin beli sesuatu',
    });

    expect(result).toEqual({
      status: 'INVALID',
      text: 'mungkin beli sesuatu',
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.5,
      },
      validationReason:
        'AI intent confidence is below the minimum threshold of 0.8',
    });

    expect(extractorService.extract).not.toHaveBeenCalled();
  });

  it('should reject invalid AI entities before resolution', async () => {
    const entities = {
      type: 'EXPENSE',
      amount: 0,
      description: 'beli makan',
      accountHint: 'BCA',
      categoryHint: 'Makanan',
      destinationAccountHint: null,
    };

    classifierService.classify.mockResolvedValue({
      intent: 'CREATE_TRANSACTION',
      confidence: 0.95,
    });

    extractorService.extract.mockResolvedValue(entities);

    validationService.normalizeEntities.mockReturnValue({
      valid: false,
      reason: 'AI transaction amount is invalid',
    });

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan',
    });

    expect(result).toEqual({
      status: 'INVALID',
      text: 'beli makan',
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.95,
      },
      entities,
      validationReason: 'AI transaction amount is invalid',
    });

    expect(resolutionService.resolve).not.toHaveBeenCalled();
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

    expect(validationService.validateIntent).toHaveBeenCalledWith({
      intent: 'CREATE_TRANSACTION',
      confidence: 0.96,
    });

    expect(validationService.normalizeEntities).toHaveBeenCalledWith(entities);

    expect(validationService.validateResolution).toHaveBeenCalledWith(
      entities,
      resolution,
    );

    expect(validationService.validateDraft).toHaveBeenCalledWith(
      entities,
      resolution,
      draft,
    );
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

  it('should reject inconsistent resolution', async () => {
    const entities = {
      type: 'TRANSFER',
      amount: 500000,
      description: 'transfer',
      accountHint: 'BCA',
      categoryHint: null,
      destinationAccountHint: 'BCA',
    };

    const resolution = {
      account: {
        status: 'RESOLVED',
        hint: 'BCA',
        account: {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
        candidates: [],
      },
      destinationAccount: {
        status: 'RESOLVED',
        hint: 'BCA',
        account: {
          id: 'account-bca',
          name: 'BCA',
          type: 'BANK',
          currency: 'IDR',
        },
        candidates: [],
      },
      category: {
        status: 'NOT_REQUESTED',
        hint: null,
        category: null,
        candidates: [],
      },
      ready: true,
    };

    classifierService.classify.mockResolvedValue({
      intent: 'CREATE_TRANSACTION',
      confidence: 0.99,
    });

    extractorService.extract.mockResolvedValue(entities);

    validationService.validateResolution.mockReturnValue({
      valid: false,
      reason: 'Source and destination accounts must be different',
    });

    resolutionService.resolve.mockResolvedValue(resolution);

    const result = await service.analyze({
      userId: 'user-id',
      text: 'transfer 500000 dari BCA ke BCA',
    });

    expect(result).toEqual({
      status: 'INVALID',
      text: 'transfer 500000 dari BCA ke BCA',
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.99,
      },
      entities,
      resolution,
      validationReason: 'Source and destination accounts must be different',
    });

    expect(draftService.buildDraft).not.toHaveBeenCalled();
  });

  it('should reject inconsistent draft', async () => {
    const entities = {
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountHint: 'BCA',
      categoryHint: null,
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
        status: 'NOT_REQUESTED',
        hint: null,
        category: null,
        candidates: [],
      },
      ready: true,
    };

    const draft = {
      type: 'EXPENSE',
      amount: 999999,
      description: 'beli makan',
      accountId: 'account-id',
      categoryId: null,
      destinationAccountId: null,
      currency: 'IDR',
      status: 'READY',
      ready: true,
      unresolvedFields: [],
    };

    classifierService.classify.mockResolvedValue({
      intent: 'CREATE_TRANSACTION',
      confidence: 0.99,
    });

    extractorService.extract.mockResolvedValue(entities);

    resolutionService.resolve.mockResolvedValue(resolution);

    draftService.buildDraft.mockReturnValue(draft);

    validationService.validateDraft.mockReturnValue({
      valid: false,
      reason:
        'AI transaction draft amount does not match extracted transaction amount',
    });

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000 dari BCA',
    });

    expect(result).toEqual({
      status: 'INVALID',
      text: 'beli makan 25000 dari BCA',
      intent: {
        intent: 'CREATE_TRANSACTION',
        confidence: 0.99,
      },
      entities,
      resolution,
      draft,
      validationReason:
        'AI transaction draft amount does not match extracted transaction amount',
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
