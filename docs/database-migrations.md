# Database Migration Workflow

This document describes the database migration workflow for the Fintech AI Integrated backend.

## 1. Source of truth

The Prisma schema is maintained at:

`src/database/prisma/schema.prisma`

Migration history is maintained at:

`src/database/prisma/migrations/`

Commit the schema changes and their corresponding migration files together. Do not exclude the migration directory from version control.

Do not delete, rename, or rewrite an already-applied migration to resolve a schema mismatch. Create a new migration after investigating the database and migration history.

## 2. Generate Prisma Client

After pulling code or changing the Prisma schema, generate the Prisma Client:

```bash
npm run db:generate
```

Generating the client does not apply database changes.

## 3. Check migration status

Configure `DATABASE_URL` for the intended database, then run:

```bash
npm run db:migrate:status
```

Review the output before applying migrations. Investigate failed, missing, or divergent migration history rather than attempting to bypass it.

## 4. Development workflow

For an intentional schema change in a development environment:

1. Update `src/database/prisma/schema.prisma`.
2. Create a migration using the project's Prisma CLI and configuration.
3. Review the generated SQL before applying it.
4. Run the relevant tests.
5. Commit the schema and migration together.

Use:

```bash
npm run db:migrate:dev
```

Run this command only against a development database. Never point it at production to create an ad hoc migration.

## 5. CI workflow

CI validates the Prisma schema, generates the client, builds the application, and runs the unit tests.

Migration files must be present in the repository. A successful schema validation or client generation alone does not prove that a migration can be applied to a live database.

If migration execution is later added to CI, use a disposable PostgreSQL database with an isolated schema or instance. Do not use production credentials.

## 6. Deployment workflow

Before applying migrations to a deployed environment:

1. Confirm the release commit contains the expected migration files.
2. Back up the database when appropriate and confirm the recovery procedure.
3. Confirm the target `DATABASE_URL` belongs to the intended environment.
4. Check migration status.
5. Review potentially destructive SQL and assess backward compatibility with the running application.
6. Apply migrations as a controlled release step:

   ```bash
   npm run db:migrate:deploy
   ```

7. Verify migration status and application health after the operation.

Do not automatically run migrations in every application container startup. Multiple replicas may start concurrently, and database changes should be managed as a deliberate release operation.

## 7. Existing migration history

If migration directories appear duplicated or have unexpected names, do not remove or consolidate them based on their names alone. Compare their SQL, Git history, and the target database's migration records before deciding on any correction.

Never manually mark a migration as applied without verifying that the corresponding database changes are already present and correct.

## 8. Safety

- Keep database credentials out of source control.
- Do not commit `.env` files containing secrets.
- Do not run migration reset commands against shared or production databases.
- Prefer additive and backward-compatible schema changes where possible.
- Verify backups and recovery procedures before high-risk database changes.

This document describes the migration workflow; it does not indicate that a production database has been migrated or deployed.
