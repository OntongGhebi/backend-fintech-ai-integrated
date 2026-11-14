ALTER TABLE "categories"
ADD COLUMN "parentId" UUID;

ALTER TABLE "categories"
ADD CONSTRAINT "categories_parentId_fkey"
FOREIGN KEY ("parentId")
REFERENCES "categories"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "categories_parentId_idx"
ON "categories"("parentId");

CREATE INDEX "categories_userId_parentId_type_idx"
ON "categories"("userId", "parentId", "type");