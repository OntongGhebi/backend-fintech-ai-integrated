# Container Build and Deployment

## Prerequisites

- Docker Desktop or Docker Engine with Compose.
- Node.js 22 and npm for local build and test commands.
- A PostgreSQL database, such as Neon.
- A valid local `.env` file.
- A `REDIS_PASSWORD` value shared by the API and Redis container.

## 1. Prepare the environment

Copy `.env.example` to `.env` and configure the required values.

Verify that:

- `DATABASE_URL` points to the intended PostgreSQL database.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are different.
- `REDIS_PASSWORD` is a strong local password.
- `FRONTEND_URL` matches the frontend origin.
- Midtrans uses sandbox credentials for local testing.

Do not commit `.env`.

## 2. Build the application

```bash
npm ci
npm install --save-dev tsc-alias
npx prisma validate
npx prisma generate
npm run build
```

Confirm that the build output contains a production entry point and that compiled JavaScript no longer contains unresolved `src/` or `@/` import aliases.

## 3. Validate Docker configuration

```bash
docker compose config --quiet
docker build --target runtime -t fintech-ai-backend:phase-14-2 .
```

## 4. Start the local stack

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 redis
docker compose logs --tail=100 api
```

The API depends on Redis becoming healthy. PostgreSQL remains an external dependency.

## 5. Verify health endpoints

For the default local port:

```bash
curl http://localhost:3000/api/v1/health/live
curl http://localhost:3000/api/v1/health/ready
```

The liveness endpoint checks whether the process responds. The readiness endpoint checks PostgreSQL and Redis.

## 6. Apply migrations separately

Build the migration image:

```bash
docker build --target migrate -t fintech-ai-migrate:phase-14-2 .
```

Before running it, verify the database URL carefully. This command applies migrations to the database specified by `DATABASE_URL`:

```bash
docker run --rm --env-file .env fintech-ai-migrate:phase-14-2
```

Do not run the migration container against production until the migration files have been reviewed, the database has a verified backup, and the release has been approved.

## 7. Stop the local stack

```bash
docker compose down
```

To preserve local Redis data, do not remove the named volume. To remove it intentionally, first ensure that the data is no longer needed.

## Production release notes

- Configure production secrets in the deployment platform's secret manager.
- Use `NODE_ENV=production` and a valid HTTPS frontend origin.
- Keep Redis and PostgreSQL private.
- Apply migrations as a separate release step.
- Verify liveness and readiness after deployment.
- Configure monitoring, alerting, backups, and rollback procedures before onboarding production users.
