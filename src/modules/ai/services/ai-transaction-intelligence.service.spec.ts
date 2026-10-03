import { Test, TestingModule } from '@nestjs/testing';

import { AIIntentClassifierService } from './ai-intent-classifier.service';

import { AITransactionEntityExtractorService } from './ai-transaction-entity-extractor.service';

import { AITransactionResolutionService } from './ai-transaction-resolution.service';

import { AITransactionDraftService } from './ai-transaction-draft.service';

import { AITransactionIntelligenceService } from './ai-transaction-intelligence.service';

describe('AITransactionIntelligenceService', () => {
  let service: AITransactionIntelligenceService;

  const intentClassifierService = {
    classify: jest.fn(),
  };

  const entityExtractorService = {
    extract: jest.fn(),
  };

  const resolutionService = {
    resolve: jest.fn(),
  };

  const draftService = {
    buildDraft: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AITransactionIntelligenceService,

        {
          provide: AIIntentClassifierService,
          useValue: intentClassifierService,
        },

        {
          provide: AITransactionEntityExtractorService,
          useValue: entityExtractorService,
        },

        {
          provide: AITransactionResolutionService,
          useValue: resolutionService,
        },

        {
          provide: AITransactionDraftService,
          useValue: draftService,
        },
      ],
    }).compile();

    service = module.get<AITransactionIntelligenceService>(
      AITransactionIntelligenceService,
    );
  });

  it('should request information when text is empty', async () => {
    await expect(
      service.analyze({
        userId: 'user-id',
        text: '   ',
      }),
    ).rejects.toThrow('AI transaction intelligence text cannot be empty');

    expect(intentClassifierService.classify).not.toHaveBeenCalled();
  });

  it('should reject unsupported intent', async () => {
    const intent = {
      intent: 'UNKNOWN',
      confidence: 0.95,
    };

    intentClassifierService.classify.mockResolvedValue(intent);

    const result = await service.analyze({
      userId: 'user-id',
      text: 'halo bot',
    });

    expect(result.status).toBe('UNSUPPORTED');

    expect(result.intent).toEqual(intent);

    expect(entityExtractorService.extract).not.toHaveBeenCalled();

    expect(resolutionService.resolve).not.toHaveBeenCalled();

    expect(draftService.buildDraft).not.toHaveBeenCalled();
  });

  it('should stop when transaction resolution needs information', async () => {
    const intent = {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      confidence: 0.95,
    };

    const entities = {
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountHint: null,
      categoryHint: null,
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
        status: 'NOT_REQUESTED',
        hint: null,
        category: null,
        candidates: [],
      },
      ready: false,
    };

    const draft = {
      type: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      accountId: null,
      categoryId: null,
      destinationAccountId: null,
      currency: 'IDR',
      status: 'NEEDS_RESOLUTION',
      ready: false,
      unresolvedFields: ['account'],
    };

    intentClassifierService.classify.mockResolvedValue(intent);

    entityExtractorService.extract.mockResolvedValue(entities);

    resolutionService.resolve.mockResolvedValue(resolution);
    draftService.buildDraft.mockReturnValue(draft);

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000',
    });

    expect(result.status).toBe('NEEDS_INFORMATION');

    expect(result.intent).toEqual(intent);

    expect(result.entities).toEqual(entities);

    expect(result.resolution).toEqual(resolution);

    expect(result.draft).toEqual(draft);

    expect(draftService.buildDraft).toHaveBeenCalledWith(entities, resolution);
  });

  it('should create a transaction draft when all information is resolved', async () => {
    const intent = {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      amount: 25000,
      description: 'beli makan',
      confidence: 0.98,
    };

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
      amount: 25000,
      description: 'beli makan',
      accountId: 'account-id',
      categoryId: null,
      destinationAccountId: null,
      currency: 'IDR',
      status: 'READY',
      ready: true,
      unresolvedFields: [],
    };

    intentClassifierService.classify.mockResolvedValue(intent);

    entityExtractorService.extract.mockResolvedValue(entities);

    resolutionService.resolve.mockResolvedValue(resolution);

    draftService.buildDraft.mockReturnValue(draft);

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000 dari BCA',
    });

    expect(result.status).toBe('READY');

    expect(intentClassifierService.classify).toHaveBeenCalledWith(
      'beli makan 25000 dari BCA',
    );

    expect(entityExtractorService.extract).toHaveBeenCalledWith(
      'beli makan 25000 dari BCA',
    );

    expect(resolutionService.resolve).toHaveBeenCalledWith('user-id', entities);

    expect(draftService.buildDraft).toHaveBeenCalledWith(entities, resolution);

    expect(result.draft).toEqual(draft);
  });

  it('should not persist a transaction during analysis', async () => {
    const intent = {
      intent: 'CREATE_TRANSACTION',
      transactionType: 'EXPENSE',
      confidence: 1,
    };

    const entities = {
      type: 'EXPENSE',
      amount: 25000,
      description: null,
      accountHint: null,
      categoryHint: null,
      destinationAccountHint: null,
    };

    const resolution = {
      account: {
        status: 'RESOLVED',
        hint: null,
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
      amount: 25000,
      description: null,
      accountId: 'account-id',
      categoryId: null,
      destinationAccountId: null,
      currency: 'IDR',
      status: 'READY',
      ready: true,
      unresolvedFields: [],
    };

    intentClassifierService.classify.mockResolvedValue(intent);

    entityExtractorService.extract.mockResolvedValue(entities);

    resolutionService.resolve.mockResolvedValue(resolution);

    draftService.buildDraft.mockReturnValue(draft);

    const result = await service.analyze({
      userId: 'user-id',
      text: 'beli makan 25000 dari BCA',
    });

    expect(result.status).toBe('READY');

    expect(result.draft).toEqual(draft);
    expect(draftService.buildDraft).toHaveBeenCalledWith(entities, resolution);
  });
});
