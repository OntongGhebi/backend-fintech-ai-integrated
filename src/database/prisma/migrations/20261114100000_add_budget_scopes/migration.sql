
CREATE TYPE "BudgetScopeType" AS ENUM (
  'ALL_EXPENSES',
  'CATEGORY',
  'CATEGORY_GROUP',
  'CUSTOM'
);

ALTER TABLE "budgets"
ADD COLUMN "scopeType" "BudgetScopeType" NOT NULL DEFAULT 'ALL_EXPENSES',
ADD COLUMN "scopeCategoryId" UUID;

-- Preserve the meaning of existing budgets.
-- Existing category-specific budgets remain CATEGORY.
-- Existing uncategorized budgets remain ALL_EXPENSES.
UPDATE "budgets"
SET
  "scopeType" = CASE
    WHEN "categoryId" IS NULL THEN 'ALL_EXPENSES'::"BudgetScopeType"
    ELSE 'CATEGORY'::"BudgetScopeType"
  END,
  "scopeCategoryId" = "categoryId";

CREATE TABLE "budget_category_scopes" (
  "id" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "budget_category_scopes_pkey"
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
"budget_category_scopes_budget_category_unique"
ON "budget_category_scopes"("budgetId", "categoryId");

CREATE INDEX "budget_category_scopes_categoryId_idx"
ON "budget_category_scopes"("categoryId");

CREATE INDEX "budget_category_scopes_budgetId_idx"
ON "budget_category_scopes"("budgetId");

CREATE INDEX "budgets_scopeType_idx"
ON "budgets"("scopeType");

CREATE INDEX "budgets_scopeCategoryId_idx"
ON "budgets"("scopeCategoryId");

ALTER TABLE "budgets"
ADD CONSTRAINT "budgets_scopeCategoryId_fkey"
FOREIGN KEY ("scopeCategoryId")
REFERENCES "categories"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "budget_category_scopes"
ADD CONSTRAINT "budget_category_scopes_budgetId_fkey"
FOREIGN KEY ("budgetId")
REFERENCES "budgets"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "budget_category_scopes"
ADD CONSTRAINT "budget_category_scopes_categoryId_fkey"
FOREIGN KEY ("categoryId")
REFERENCES "categories"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;