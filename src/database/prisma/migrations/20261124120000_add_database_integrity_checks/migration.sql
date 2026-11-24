
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transactions WHERE amount <= 0
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: transactions contains amount <= 0';
  END IF;

  IF EXISTS (
    SELECT 1 FROM budgets
    WHERE amount <= 0
       OR ("endDate" IS NOT NULL AND "endDate" < "startDate")
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: budgets contains invalid amount or date range';
  END IF;

  IF EXISTS (
    SELECT 1 FROM recurring_transactions WHERE amount <= 0
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: recurring_transactions contains amount <= 0';
  END IF;

  IF EXISTS (
    SELECT 1 FROM payments WHERE amount <= 0
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: payments contains amount <= 0';
  END IF;

  IF EXISTS (
    SELECT 1 FROM budget_allocations WHERE amount < 0
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: budget_allocations contains amount < 0';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM budget_recommendations
    WHERE "currentAllocation" < 0
       OR "proposedAllocation" < 0
       OR "averageMonthlySpend" < 0
       OR "transactionCount" < 0
       OR "monthsWithActivity" < 0
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: budget_recommendations contains negative financial values or counters';
  END IF;

  IF EXISTS (
    SELECT 1 FROM usage_records WHERE "usageCount" < 0
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: usage_records contains usageCount < 0';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ai_usage
    WHERE "inputTokens" < 0
       OR "outputTokens" < 0
       OR "totalTokens" < 0
  ) THEN
    RAISE EXCEPTION
      'Database integrity migration blocked: ai_usage contains negative token counters';
  END IF;
END $$;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_amount_positive_check
  CHECK (amount > 0) NOT VALID;

ALTER TABLE budgets
  ADD CONSTRAINT budgets_amount_positive_check
  CHECK (amount > 0) NOT VALID;

ALTER TABLE budgets
  ADD CONSTRAINT budgets_date_range_check
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate") NOT VALID;

ALTER TABLE recurring_transactions
  ADD CONSTRAINT recurring_transactions_amount_positive_check
  CHECK (amount > 0) NOT VALID;

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive_check
  CHECK (amount > 0) NOT VALID;

ALTER TABLE budget_allocations
  ADD CONSTRAINT budget_allocations_amount_non_negative_check
  CHECK (amount >= 0) NOT VALID;

ALTER TABLE budget_recommendations
  ADD CONSTRAINT budget_recommendations_financial_values_non_negative_check
  CHECK (
    "currentAllocation" >= 0
    AND "proposedAllocation" >= 0
    AND "averageMonthlySpend" >= 0
  ) NOT VALID;

ALTER TABLE budget_recommendations
  ADD CONSTRAINT budget_recommendations_activity_counts_non_negative_check
  CHECK (
    "transactionCount" >= 0
    AND "monthsWithActivity" >= 0
  ) NOT VALID;

ALTER TABLE usage_records
  ADD CONSTRAINT usage_records_usage_count_non_negative_check
  CHECK ("usageCount" >= 0) NOT VALID;

ALTER TABLE ai_usage
  ADD CONSTRAINT ai_usage_token_counts_non_negative_check
  CHECK (
    "inputTokens" >= 0
    AND "outputTokens" >= 0
    AND "totalTokens" >= 0
  ) NOT VALID;

ALTER TABLE transactions
  VALIDATE CONSTRAINT transactions_amount_positive_check;

ALTER TABLE budgets
  VALIDATE CONSTRAINT budgets_amount_positive_check;

ALTER TABLE budgets
  VALIDATE CONSTRAINT budgets_date_range_check;

ALTER TABLE recurring_transactions
  VALIDATE CONSTRAINT recurring_transactions_amount_positive_check;

ALTER TABLE payments
  VALIDATE CONSTRAINT payments_amount_positive_check;

ALTER TABLE budget_allocations
  VALIDATE CONSTRAINT budget_allocations_amount_non_negative_check;

ALTER TABLE budget_recommendations
  VALIDATE CONSTRAINT budget_recommendations_financial_values_non_negative_check;

ALTER TABLE budget_recommendations
  VALIDATE CONSTRAINT budget_recommendations_activity_counts_non_negative_check;

ALTER TABLE usage_records
  VALIDATE CONSTRAINT usage_records_usage_count_non_negative_check;

ALTER TABLE ai_usage
  VALIDATE CONSTRAINT ai_usage_token_counts_non_negative_check;
