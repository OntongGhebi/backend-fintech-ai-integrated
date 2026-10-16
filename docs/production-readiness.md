# Production Readiness Checklist

## 1. Environment and secrets

- [ ] Set `NODE_ENV=production`.
- [ ] Set `PORT` and `API_PREFIX` for the deployment platform.
- [ ] Set `FRONTEND_URL` to the real HTTPS frontend origin.
- [ ] Set `DATABASE_URL` to the production PostgreSQL connection string.
- [ ] Generate independent JWT access and refresh secrets, each at least
      32 characters long.
- [ ] Store secrets in the deployment platform's secret manager.
- [ ] Configure `RESEND_API_KEY` and `EMAIL_FROM` for email delivery.
- [ ] Configure Midtrans production credentials only when production payments
      are ready and verified.
- [ ] Configure Telegram credentials and webhook settings if Telegram is used.
- [ ] Configure AI provider credentials only when the feature is enabled.
- [ ] Never commit `.env`, production credentials, or database URLs.

## 2. Redis

- [ ] Use a managed Redis service or a properly secured Redis deployment.
- [ ] Configure `REDIS_URL`, or configure `REDIS_HOST`, `REDIS_PORT`,
      `REDIS_PASSWORD`, and `REDIS_DB`.
- [ ] Ensure the application and Redis use the same credentials.
- [ ] Do not expose Redis directly to the public internet.
- [ ] Verify persistence, backup, and recovery requirements for the selected
      Redis deployment.
- [ ] Verify BullMQ workers reconnect and recover after temporary outages.

For local development, `docker compose up -d redis` starts the Redis service.
The Compose configuration reads `REDIS_PASSWORD` from the root `.env` file.

## 3. Database migrations

Run these commands in the deployment pipeline after confirming that the
target database and backup strategy are correct:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
```

Use `prisma migrate deploy` for deployment. Do not use `prisma migrate dev`
against production. Review migrations before applying them to a database
containing real financial data.

Do not automatically seed production unless a separately reviewed production
seeding procedure explicitly requires it.

## 4. Build and startup

```bash
npm ci
npx prisma generate
npm run build
npm run start:prod
```

Run the build in the deployment pipeline before promoting an artifact.
Ensure the runtime has the required environment variables and that the
generated Prisma client is included in the build artifact.

## 5. Health checks

- `GET /api/v1/health/live`: process liveness.
- `GET /api/v1/health/ready`: readiness of PostgreSQL and Redis.
- `GET /api/v1/health`: backward-compatible readiness endpoint.

Use the liveness endpoint for process health. Use the readiness endpoint to
decide whether the instance should receive traffic.

## 6. Security and operations

- Swagger is disabled when `NODE_ENV=production`.
- HTTPS should terminate at a trusted load balancer or deployment platform.
- Restrict database and Redis network access to trusted application workloads.
- Configure centralized logs, alerting, and retention.
- Monitor API errors, latency, queue backlog, failed jobs, database connections,
  Redis availability, and payment webhook failures.
- Verify graceful shutdown behavior during a rolling deployment.
- Confirm that backups can be restored before onboarding production users.

## 7. Release gate

Do not mark the application production-ready until:

- [ ] Unit and E2E tests pass.
- [ ] Production build succeeds.
- [ ] Environment validation passes with production-safe values.
- [ ] Database migrations are reviewed and applied successfully.
- [ ] Health endpoints behave as expected.
- [ ] Redis, BullMQ, email, payments, and Telegram integrations have been tested
      in the intended deployment environment.
- [ ] Monitoring, alerting, backups, and rollback procedures are documented.
