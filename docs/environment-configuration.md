# Environment Configuration

This document describes the environment variables used by the backend
and the validation rules applied at application startup.

## Required application settings

| Variable             | Purpose                            |
| -------------------- | ---------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string       |
| `JWT_ACCESS_SECRET`  | Secret used to sign access tokens  |
| `JWT_REFRESH_SECRET` | Secret used to sign refresh tokens |

The application rejects missing or empty required values.

## Application settings

| Variable                 | Default / notes                             |
| ------------------------ | ------------------------------------------- |
| `NODE_ENV`               | `development`, `test`, or `production`      |
| `PORT`                   | `3000`                                      |
| `API_PREFIX`             | `api/v1`                                    |
| `APP_TIMEZONE`           | `Asia/Jakarta`                              |
| `FRONTEND_URL`           | Required as a valid HTTPS URL in production |
| `JWT_ACCESS_EXPIRES_IN`  | `15m`                                       |
| `JWT_REFRESH_EXPIRES_IN` | `7d`                                        |

## Redis

The backend uses Redis for queue-related and temporary data operations.

Supported configuration:

- `REDIS_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_DB`

Production must explicitly configure either `REDIS_URL` or `REDIS_HOST`.
Do not rely on the development default of `localhost` in a deployed environment.

Use a private connection and authentication where supported by the Redis
service. Do not commit Redis credentials.

## AI configuration

AI integration remains disabled until a provider is intentionally configured.

Recommended configuration while AI integration is deferred:

- `AI_ENABLED=false`
- `AI_PROVIDER=none`
- `AI_API_KEY` empty
- `AI_BASE_URL` empty
- `AI_MODEL` empty

When AI is enabled, configure all of the following:

- `AI_PROVIDER=openai-compatible`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`

`AI_TIMEOUT_MS` optionally controls the provider request timeout.

The provider must be supported by the application. Do not use a placeholder
provider name as a substitute for an actual integration.

## Production security rules

When `NODE_ENV=production`:

- Access and refresh JWT secrets must each contain at least 32 characters.
- The access and refresh JWT secrets must be different.
- `FRONTEND_URL` must be a valid HTTPS URL.
- Redis connection configuration must be explicit.
- Real secrets must be supplied through the deployment environment or a
  secrets manager, not committed to source control.

Generate independent JWT secrets using a cryptographically secure generator.
Never reuse the CI-only example secrets in a real environment.

## CI and local verification

CI may use dummy values to validate configuration and compile the application.
These values must not be reused in development shared environments or production.

Before a release, validate the environment against the actual target
environment and confirm that database, Redis, email, Telegram, payment gateway,
and other integrations have the required configuration for the features enabled.

This validation document does not imply that an external deployment has occurred.
