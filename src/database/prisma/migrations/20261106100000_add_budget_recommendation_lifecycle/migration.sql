CREATE TYPE "BudgetRecommendationAction" AS ENUM (
  'INCREASE',
  'DECREASE',
  'MAINTAIN',
  'REVIEW'
);

CREATE TYPE "BudgetRecommendationStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'DEFERRED',
  'APPLIED',
  'EVALUATED'
);

CREATE TYPE "BudgetRecommendationEvaluationStatus" AS ENUM (
  'WITHIN_ALLOCATION',
  'OVER_ALLOCATION',
  'NO_ACTIVITY'
);

CREATE TABLE "budget_recommendations" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "targetMonth" DATE NOT NULL,
  "budgetName" VARCHAR(100) NOT NULL,
  "categoryId" UUID,
  "categoryName" VARCHAR(100) NOT NULL,

  "action" "BudgetRecommendationAction" NOT NULL,
  "status" "BudgetRecommendationStatus" NOT NULL DEFAULT 'PENDING',

  "currentAllocation" DECIMAL(19,4) NOT NULL,
  "proposedAllocation" DECIMAL(19,4) NOT NULL,
  "changeAmount" DECIMAL(19,4) NOT NULL,
  "changePercentage" DECIMAL(9,2),
  "averageMonthlySpend" DECIMAL(19,4) NOT NULL,

  "transactionCount" INTEGER NOT NULL,
  "monthsWithActivity" INTEGER NOT NULL,
  "spendingTrend" VARCHAR(20) NOT NULL,

  "monthlySpending" JSONB NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "guardrails" JSONB NOT NULL,
  "aiExplanation" VARCHAR(1000),
  "aiWhyItMatters" VARCHAR(1000),
  "aiSuggestedActions" JSONB NOT NULL,
  "financialContext" JSONB NOT NULL,

  "reviewedAt" TIMESTAMPTZ(6),
  "deferredUntil" TIMESTAMPTZ(6),
  "rejectionReason" VARCHAR(500),
  "appliedAt" TIMESTAMPTZ(6),
  "evaluatedAt" TIMESTAMPTZ(6),

  "evaluationStatus" "BudgetRecommendationEvaluationStatus",
  "evaluation" JSONB,

  "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "budget_recommendations_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "budget_recommendations_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT "budget_recommendations_budgetId_fkey"
    FOREIGN KEY ("budgetId")
    REFERENCES "budgets"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "budget_recommendations_user_budget_month_unique"
  ON "budget_recommendations"("userId", "budgetId", "targetMonth");

CREATE INDEX "budget_recommendations_user_status_month_idx"
  ON "budget_recommendations"("userId", "status", "targetMonth");

CREATE INDEX "budget_recommendations_user_month_idx"
  ON "budget_recommendations"("userId", "targetMonth");

CREATE INDEX "budget_recommendations_budget_month_idx"
  ON "budget_recommendations"("budgetId", "targetMonth");

ALTER TABLE "budget_allocations"
  ADD CONSTRAINT "budget_allocations_recommendationId_fkey"
  FOREIGN KEY ("recommendationId")
  REFERENCES "budget_recommendations"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "budget_allocations_recommendationId_idx"
  ON "budget_allocations"("recommendationId");