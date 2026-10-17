# Fintech AI Integrated — Backend Technical Handover

## 1. Project Overview

Fintech AI Integrated is a multi-user personal finance application designed to help users manage financial accounts, income, expenses, transfers, budgets, recurring transactions, reports, notifications, and payment-based subscriptions.

The backend provides authenticated API access, user data isolation, financial calculations, asynchronous job processing, and integrations with external services.

## 2. Technology Stack

| Component                      | Technology                    |
| ------------------------------ | ----------------------------- |
| Runtime                        | Node.js 22                    |
| Language                       | TypeScript                    |
| Backend framework              | NestJS 11                     |
| Database                       | PostgreSQL                    |
| Database hosting               | Neon PostgreSQL               |
| ORM                            | Prisma 7                      |
| Cache and queue infrastructure | Redis and BullMQ              |
| Authentication                 | JWT access and refresh tokens |
| API documentation              | Swagger                       |
| Automated testing              | Jest and end-to-end tests     |
| Payment gateway                | Midtrans Snap                 |
| Email service                  | Resend                        |
| Messaging integration          | Telegram Bot                  |
| API prefix                     | `/api/v1`                     |
| Application timezone           | `Asia/Jakarta`                |
| Supported currency             | `IDR`                         |

## 3. Implemented Backend Areas

The implementation and tests for the following areas have been completed in the project roadmap:

- Authentication, token management, and access control.
- User-owned resource authorization and IDOR protection.
- Financial accounts, income, expenses, and transfers.
- Budgets and budget alerts.
- Recurring transactions.
- Dashboard summaries and financial reports.
- Notifications and asynchronous notification delivery.
- Subscription payment checkout and Midtrans webhook handling.
- Security hardening, request validation, rate limiting, and logging controls.
- Health checks and runtime configuration validation.
- Containerization and CI automation.
- Prisma migration readiness and release-readiness documentation.

**Important:** This list records implemented roadmap areas; it is not a claim that every external service is currently configured in production. External integration behavior must be verified in the intended environment before release.

## 4. API and Runtime

- API base path: `/api/v1`
- Swagger documentation: `/docs` when enabled by the application configuration.
- Liveness endpoint: `/api/v1/health/live`
- Readiness endpoint: `/api/v1/health/ready`

A successful liveness check indicates that the application process responds. It does not independently prove that PostgreSQL, Redis, email delivery, Telegram, or Midtrans are all operational.

## 5. Environment and Secrets

Configure environment variables through the deployment platform's secret management facility.

Required configuration includes:

- PostgreSQL connection URL.
- Independent access-token and refresh-token secrets.
- Frontend URL and CORS configuration.
- Redis connection configuration.
- Application port, API prefix, and timezone.
- Email provider credentials and sender configuration where email delivery is enabled.
- Telegram credentials and webhook configuration where Telegram functionality is enabled.
- Midtrans credentials and the appropriate gateway environment.
- AI configuration, which must remain disabled until explicitly approved.

Never commit `.env` files, credentials, private keys, or production secrets.

## 6. Database and Migration Policy

Prisma schema changes and their corresponding migration files must be reviewed and committed together.

Before applying migrations to a target environment:

1. Verify the target database and connection configuration.
2. Review the migration status.
3. Inspect migration SQL for destructive or incompatible changes.
4. Confirm the recovery and backup strategy.
5. Obtain release approval.
6. Apply migrations using the production-appropriate deployment workflow.

Use `npm run db:migrate:deploy` only after verifying and approving the target environment.

Do not use development migration or database reset commands against production.

## 7. Verification Commands

Run the following commands from the backend directory:

```bash
npm ci
npm run check:release
git diff --check
git status --short
```

The release check is expected to validate the Prisma schema, generate Prisma Client, build the application, and run the unit-test suite.

The existing GitHub Actions workflows provide additional automated verification. A successful CI run does not replace integration tests against the actual deployment environment.

## 8. Deployment Readiness

Before deployment, verify:

- The intended release commit is identified.
- The working tree is clean.
- Required migration files are tracked.
- Environment validation passes.
- Production secrets are configured securely.
- PostgreSQL and Redis are reachable from the deployment environment.
- CORS and frontend URLs match the intended environment.
- Email, Telegram, and payment integrations are configured and tested as applicable.
- Health endpoints respond as expected after deployment.
- Authentication and core financial workflows pass smoke tests.
- Logging and monitoring do not expose sensitive information.
- A rollback and database recovery procedure exists.

Refer to `docs/release-readiness.md` for the release checklist and `docs/database-migrations.md` for migration procedures.

## 9. AI Integration Status

AI integration remains disabled.

Recommended baseline configuration:

```dotenv
AI_ENABLED=false
AI_PROVIDER=none
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
```

Do not activate AI until provider configuration, cost controls, timeout behavior, error handling, privacy requirements, and monitoring have been reviewed and tested.

## 10. Known Release Boundaries

- Cloud deployment is deferred until a suitable hosting environment is available and verified.
- Production database migrations have not been authorized by this handover.
- Production credentials and external integrations must be verified separately.
- AI remains disabled.
- Sandbox payment verification does not establish readiness to accept real payments.

## 11. Recommended Next Work

After this backend handover:

1. Complete the final verification against the latest committed repository state.
2. Select and verify an appropriate hosting environment.
3. Configure secrets, PostgreSQL, Redis, and external integrations.
4. Deploy to a non-production environment.
5. Run integration tests and smoke tests against that deployment.
6. Review production security, monitoring, backups, and rollback readiness.
7. Activate AI only in a separately reviewed phase.

## 12. Handover Status

This document describes the backend implementation and the procedures required for the next stage. It is not evidence of a production deployment, production database migration, or production acceptance test.

Update this document whenever the implementation, runtime configuration, or deployment architecture materially changes.
