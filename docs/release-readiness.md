# Release Readiness Checklist

This checklist defines the minimum verification required before releasing the Fintech AI Integrated backend.

Completing this checklist does not mean the application has been deployed.

## 1. Source control

- [ ] All intended changes are committed.
- [ ] The working tree is clean.
- [ ] The release commit is identifiable.
- [ ] Prisma schema changes and their migration files are committed together.
- [ ] No `.env` files, credentials, private keys, or production secrets are committed.

## 2. Automated verification

Run the release verification command:

```bash
npm run check:release
```

Confirm that:

- [ ] Prisma schema validation passes.
- [ ] Prisma Client generation passes.
- [ ] The production build passes.
- [ ] All unit tests pass.
- [ ] GitHub Actions succeeds for the intended release commit.

The automated checks do not replace integration testing against the intended deployment environment.

## 3. Database readiness

- [ ] Confirm that `DATABASE_URL` points to the intended environment.
- [ ] Review the migration status.
- [ ] Confirm all expected migration files are present in the release commit.
- [ ] Review migration SQL for destructive or incompatible changes.
- [ ] Confirm a suitable backup and recovery procedure for production.
- [ ] Plan migration execution as a controlled release step.

Use `npm run db:migrate:status` only when connected to the intended database. Use `npm run db:migrate:deploy` only after the release has been approved and the target environment has been verified.

Never run development migration commands or database reset commands against production.

## 4. Runtime configuration

Before deployment, verify the target environment provides:

- [ ] A valid PostgreSQL connection string.
- [ ] Independent, sufficiently strong access and refresh JWT secrets.
- [ ] An HTTPS frontend URL for production.
- [ ] Explicit Redis connection configuration.
- [ ] Correct application port and API prefix.
- [ ] Appropriate CORS origins.
- [ ] Email provider credentials and sender configuration for enabled email features.
- [ ] Telegram credentials and webhook configuration for enabled Telegram features.
- [ ] Midtrans credentials and environment mode appropriate to the target environment.

Provide secrets through the deployment platform's secret configuration, not through source control.

## 5. AI feature flag

AI integration remains intentionally disabled until it is explicitly ready for activation.

Recommended initial configuration:

```dotenv
AI_ENABLED=false
AI_PROVIDER=none
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
```

Do not enable AI in production until provider credentials, cost controls, error handling, timeout behavior, privacy requirements, and monitoring have been reviewed.

## 6. Deployment and health checks

After an approved deployment:

- [ ] Confirm the application process starts successfully.
- [ ] Confirm `/api/v1/health/live` responds successfully.
- [ ] Confirm `/api/v1/health/ready` reports the expected readiness state.
- [ ] Confirm logs contain no exposed secrets or unexpected startup errors.
- [ ] Verify authentication and one or more core user-owned API workflows.
- [ ] Verify payment webhook configuration before accepting real payments.
- [ ] Check database migration status and application error rates.

Do not interpret a successful liveness response as proof that every external dependency is healthy.

## 7. Rollback planning

Before release, document:

- The previous known-good application version.
- The process for redeploying that version.
- Whether database changes are backward compatible.
- The database recovery procedure if a migration cannot be safely reversed.
- The person responsible for approving rollback.

Application rollback does not automatically reverse database migrations. Avoid destructive rollback scripts unless they have been reviewed and tested against a safe environment.

## 8. Current release constraints

Cloud deployment remains deferred until an appropriate hosting environment is available and verified. AI remains disabled.

This checklist prepares the project for a controlled release. It does not confirm that hosting, external integrations, production credentials, or a production database have been configured or deployed.
