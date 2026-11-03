-- Additive migration: preserve the existing budgets table and all existing API behavior.
CREATE TYPE "BudgetAllocationSource" AS ENUM (
  'MANUAL',
  'LEGACY_MIGRATION',
  'RECOMMENDATION',
  'ACCEPTED_RECOMMENDATION'
);

CREATE TABLE "budget_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "budgetId" UUID NOT NULL,
  "periodStart" DATE NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "source" "BudgetAllocationSource" NOT NULL DEFAULT 'MANUAL',
  "previousAmount" DECIMAL(19,4),
  "recommendationId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "budget_allocations_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "budget_allocations_budget_period_unique" UNIQUE ("budgetId", "periodStart")
);

CREATE INDEX "budget_allocations_budget_period_idx"
  ON "budget_allocations"("budgetId", "periodStart" DESC);

-- Backfill one allocation per calendar month covered by each legacy budget.
-- Legacy records contain only the latest amount, so older copied values are explicitly
-- marked LEGACY_MIGRATION and must not be represented as historically verified values.
INSERT INTO "budget_allocations" (
  "id", "budgetId", "periodStart", "amount", "source", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  b."id",
  month_start::date,
  b."amount",
  'LEGACY_MIGRATION'::"BudgetAllocationSource",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "budgets" AS b
CROSS JOIN LATERAL generate_series(
    date_trunc('month', b."startDate"::timestamp),
    date_trunc(
        'month',
        LEAST(COALESCE(b."endDate", CURRENT_DATE), CURRENT_DATE)::timestamp
    ),
    interval '1 month'
) AS months(month_start)
WHERE
    b."amount" IS NOT NULL
    AND b."startDate" <= CURRENT_DATE
ON CONFLICT ("budgetId", "periodStart") DO NOTHING;
