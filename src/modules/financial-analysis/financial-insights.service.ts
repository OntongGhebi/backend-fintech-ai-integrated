import { Injectable, Logger } from '@nestjs/common';

import { AIService } from '../ai/services/ai.service';
import { AI_USAGE_FEATURES } from '../ai/constants/ai-usage.constants';
import type { AICompletionUsage } from '../ai/types/ai.types';

import {
  FinancialAnalysisOverview,
  FinancialAnalysisService,
} from './financial-analysis.service';

import {
  buildFinancialInsightsMessages,
  FinancialInsightEvidenceFacts,
} from './utils/financial-insights-prompt.util';

export type FinancialInsightType =
  | 'CASH_FLOW'
  | 'SAVINGS'
  | 'SPENDING_PATTERN'
  | 'BUDGET_HEALTH'
  | 'FINANCIAL_TREND'
  | 'DATA_QUALITY';

export interface FinancialInsightEvidence {
  metricKey: string;
  value: string | number;
}

export interface FinancialInsight {
  type: FinancialInsightType;
  title: string;
  description: string;
  whyItMatters: string;
  suggestedActions: string[];
  evidence: FinancialInsightEvidence[];
}

export type FinancialInsightsStatus =
  'GENERATED' | 'NO_INSIGHTS' | 'UNAVAILABLE';

export interface FinancialInsightsResult {
  status: FinancialInsightsStatus;
  generatedAt: string;
  currency: string;
  period: {
    startDate: string;
    endDate: string;
  };
  insights: FinancialInsight[];
  provider: string | null;
  model: string | null;
  usage?: AICompletionUsage;
  message?: string;
}

interface RawFinancialInsight {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  whyItMatters?: unknown;
  suggestedActions?: unknown;
  evidenceMetricKeys?: unknown;
}

interface RawFinancialInsightsResponse {
  insights?: unknown;
}

const ALLOWED_INSIGHT_TYPES = new Set<FinancialInsightType>([
  'CASH_FLOW',
  'SAVINGS',
  'SPENDING_PATTERN',
  'BUDGET_HEALTH',
  'FINANCIAL_TREND',
  'DATA_QUALITY',
]);

const MAX_INSIGHTS = 5;
const MAX_ACTIONS_PER_INSIGHT = 3;

@Injectable()
export class FinancialInsightsService {
  private readonly logger = new Logger(FinancialInsightsService.name);

  constructor(
    private readonly financialAnalysisService: FinancialAnalysisService,
    private readonly aiService: AIService,
  ) {}

  async generate(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<FinancialInsightsResult> {
    const overview = await this.financialAnalysisService.getOverview(
      userId,
      options,
    );

    const baseResult = {
      generatedAt: new Date().toISOString(),
      currency: overview.currency,
      period: overview.period,
    };

    if (!this.hasMeaningfulFinancialData(overview)) {
      return {
        ...baseResult,
        status: 'NO_INSIGHTS',
        insights: [],
        provider: null,
        model: null,
        message:
          'Belum tersedia data finansial yang cukup untuk menghasilkan insight.',
      };
    }

    const evidenceFacts = this.buildEvidenceFacts(overview);

    const messages = buildFinancialInsightsMessages(overview, evidenceFacts);

    try {
      const completion = await this.aiService.complete(
        {
          messages,
          temperature: 0.2,
          maxTokens: 2500,
          responseFormat: 'text',
        },
        {
          userId,
          feature: AI_USAGE_FEATURES.FINANCIAL_INSIGHTS,
        },
      );

      const parsed = this.parseResponse(completion.content);

      const insights = this.normalizeInsights(parsed, evidenceFacts);

      return {
        ...baseResult,
        status: insights.length > 0 ? 'GENERATED' : 'NO_INSIGHTS',
        insights,
        provider: completion.provider,
        model: completion.model,
        usage: completion.usage,
        ...(insights.length === 0
          ? {
              message:
                'Analisis selesai, tetapi belum ditemukan insight tambahan yang cukup didukung data.',
            }
          : {}),
      };
    } catch (error) {
      this.logger.warn(
        `Financial insights generation unavailable for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      return {
        ...baseResult,
        status: 'UNAVAILABLE',
        insights: [],
        provider: null,
        model: null,
        message:
          'AI Financial Insights sedang tidak tersedia. Data analisis finansial tetap dapat diakses melalui endpoint overview.',
      };
    }
  }

  private hasMeaningfulFinancialData(
    overview: FinancialAnalysisOverview,
  ): boolean {
    return (
      overview.summary.transactionCount > 0 ||
      overview.budgetHealth.budgetCount > 0 ||
      overview.signals.length > 0
    );
  }

  private buildEvidenceFacts(
    overview: FinancialAnalysisOverview,
  ): FinancialInsightEvidenceFacts {
    const facts: FinancialInsightEvidenceFacts = {
      'summary.totalIncome': overview.summary.totalIncome,
      'summary.totalExpense': overview.summary.totalExpense,
      'summary.netCashFlow': overview.summary.netCashFlow,
      'summary.transactionCount': overview.summary.transactionCount,
      'summary.cashFlowStatus': overview.summary.cashFlowStatus,
      'spendingPatterns.totalExpense': overview.spendingPatterns.totalExpense,
      'spendingPatterns.transactionCount':
        overview.spendingPatterns.transactionCount,
      'spendingPatterns.topCategoryConcentration':
        overview.spendingPatterns.topCategoryConcentration,
      'budgetHealth.totalAllocation': overview.budgetHealth.totalAllocation,
      'budgetHealth.totalSpent': overview.budgetHealth.totalSpent,
      'budgetHealth.remaining': overview.budgetHealth.remaining,
      'budgetHealth.budgetCount': overview.budgetHealth.budgetCount,
      'budgetHealth.onTrackCount': overview.budgetHealth.onTrackCount,
      'budgetHealth.nearLimitCount': overview.budgetHealth.nearLimitCount,
      'budgetHealth.overBudgetCount': overview.budgetHealth.overBudgetCount,
    };

    if (overview.summary.savingsRate !== null) {
      facts['summary.savingsRate'] = overview.summary.savingsRate;
    }

    if (overview.summary.expenseToIncomeRatio !== null) {
      facts['summary.expenseToIncomeRatio'] =
        overview.summary.expenseToIncomeRatio;
    }

    if (overview.budgetHealth.utilizationPercentage !== null) {
      facts['budgetHealth.utilizationPercentage'] =
        overview.budgetHealth.utilizationPercentage;
    }

    const topCategory = overview.spendingPatterns.topCategories[0];

    if (topCategory) {
      facts['spendingPatterns.topCategory.name'] = topCategory.categoryName;
      facts['spendingPatterns.topCategory.totalAmount'] =
        topCategory.totalAmount;
      facts['spendingPatterns.topCategory.percentage'] = topCategory.percentage;
      facts['spendingPatterns.topCategory.transactionCount'] =
        topCategory.transactionCount;
    }

    this.addTrendFacts(facts, 'trends.income', overview.trends.income);
    this.addTrendFacts(facts, 'trends.expense', overview.trends.expense);
    this.addTrendFacts(
      facts,
      'trends.netCashFlow',
      overview.trends.netCashFlow,
    );

    for (const signal of overview.signals) {
      facts[`signals.${signal.code}`] = signal.description;
    }

    return facts;
  }

  private addTrendFacts(
    facts: FinancialInsightEvidenceFacts,
    prefix: string,
    trend: FinancialAnalysisOverview['trends']['income'],
  ): void {
    facts[`${prefix}.direction`] = trend.direction;

    if (trend.changePercentage !== null) {
      facts[`${prefix}.changePercentage`] = trend.changePercentage;
    }

    if (trend.previousPeriod !== null) {
      facts[`${prefix}.previousPeriod`] = trend.previousPeriod;
    }

    if (trend.currentPeriod !== null) {
      facts[`${prefix}.currentPeriod`] = trend.currentPeriod;
    }
  }

  private parseResponse(content: string): RawFinancialInsightsResponse {
    const normalizedContent = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsed: unknown;

    try {
      parsed = JSON.parse(normalizedContent);
    } catch {
      throw new Error('AI returned an invalid JSON response');
    }

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('AI returned an invalid response structure');
    }

    const response = parsed as RawFinancialInsightsResponse;

    if (!Array.isArray(response.insights)) {
      throw new Error('AI response does not contain an insights array');
    }

    return response;
  }

  private normalizeInsights(
    response: RawFinancialInsightsResponse,
    evidenceFacts: FinancialInsightEvidenceFacts,
  ): FinancialInsight[] {
    if (!Array.isArray(response.insights)) {
      return [];
    }

    const normalized: FinancialInsight[] = [];
    const seen = new Set<string>();

    for (const rawInsight of response.insights.slice(0, MAX_INSIGHTS)) {
      const insight = this.normalizeInsight(rawInsight, evidenceFacts);

      if (!insight) {
        continue;
      }

      const deduplicationKey = `${insight.type}:${insight.title.toLowerCase()}`;

      if (seen.has(deduplicationKey)) {
        continue;
      }

      seen.add(deduplicationKey);
      normalized.push(insight);
    }

    return normalized;
  }

  private normalizeInsight(
    value: unknown,
    evidenceFacts: FinancialInsightEvidenceFacts,
  ): FinancialInsight | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const raw = value as RawFinancialInsight;

    if (
      typeof raw.type !== 'string' ||
      !ALLOWED_INSIGHT_TYPES.has(raw.type as FinancialInsightType)
    ) {
      return null;
    }

    const title = this.normalizeText(raw.title, 120);
    const description = this.normalizeText(raw.description, 600);
    const whyItMatters = this.normalizeText(raw.whyItMatters, 400);

    if (!title || !description || !whyItMatters) {
      return null;
    }

    const suggestedActions = this.normalizeActions(raw.suggestedActions);

    const evidence = this.normalizeEvidence(
      raw.evidenceMetricKeys,
      evidenceFacts,
    );

    // Insight tanpa bukti backend tidak boleh ditampilkan.
    if (evidence.length === 0) {
      return null;
    }

    return {
      type: raw.type as FinancialInsightType,
      title,
      description,
      whyItMatters,
      suggestedActions,
      evidence,
    };
  }

  private normalizeText(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (!normalized || normalized.length > maxLength) {
      return null;
    }

    return normalized;
  }

  private normalizeActions(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 240)
      .slice(0, MAX_ACTIONS_PER_INSIGHT);
  }

  private normalizeEvidence(
    value: unknown,
    evidenceFacts: FinancialInsightEvidenceFacts,
  ): FinancialInsightEvidence[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const evidence: FinancialInsightEvidence[] = [];

    for (const metricKey of value) {
      if (
        typeof metricKey !== 'string' ||
        seen.has(metricKey) ||
        !Object.prototype.hasOwnProperty.call(evidenceFacts, metricKey)
      ) {
        continue;
      }

      seen.add(metricKey);

      evidence.push({
        metricKey,
        value: evidenceFacts[metricKey],
      });
    }

    return evidence;
  }
}
