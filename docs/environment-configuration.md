# Environment Configuration

Dokumen ini menjelaskan konfigurasi runtime backend Fintech AI Integrated.

## 1. Required environment

| Variable             | Keterangan                 |
| -------------------- | -------------------------- |
| `DATABASE_URL`       | PostgreSQL connection URL  |
| `JWT_ACCESS_SECRET`  | Secret untuk access token  |
| `JWT_REFRESH_SECRET` | Secret untuk refresh token |

Ketiga variabel tersebut wajib tersedia sebelum aplikasi dijalankan.

## 2. Application

| Variable       | Default        | Keterangan                               |
| -------------- | -------------- | ---------------------------------------- |
| `NODE_ENV`     | `development`  | `development`, `test`, atau `production` |
| `PORT`         | `3000`         | Port HTTP API, integer 1–65535           |
| `API_PREFIX`   | `api/v1`       | Prefix endpoint API                      |
| `APP_TIMEZONE` | `Asia/Jakarta` | IANA timezone                            |
| `FRONTEND_URL` | —              | Origin frontend untuk CORS               |

`FRONTEND_URL` hanya boleh berisi origin, tanpa path, query, fragment, atau credential.

Contoh development:

```dotenv
FRONTEND_URL=http://localhost:5173
```

Contoh production:

```dotenv
FRONTEND_URL=https://app.example.com
```

Production wajib menggunakan HTTPS.

## 3. Authentication

| Variable                 | Default | Keterangan                   |
| ------------------------ | ------- | ---------------------------- |
| `JWT_ACCESS_SECRET`      | —       | Access token signing secret  |
| `JWT_ACCESS_EXPIRES_IN`  | `15m`   | Access token lifetime        |
| `JWT_REFRESH_SECRET`     | —       | Refresh token signing secret |
| `JWT_REFRESH_EXPIRES_IN` | `7d`    | Refresh token lifetime       |

Production requirements:

- Kedua secret minimal 32 karakter.
- Access dan refresh secret wajib berbeda.
- Gunakan nilai acak yang dihasilkan secara kriptografis.
- Jangan menggunakan secret CI atau development di production.

## 4. PostgreSQL

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Gunakan connection URL dari provider database.

Sebelum menjalankan migration:

1. Pastikan target database benar.
2. Periksa migration status.
3. Review SQL migration.
4. Pastikan backup dan recovery tersedia.
5. Terapkan migration melalui prosedur release yang disetujui.

## 5. Redis and BullMQ

| Variable         | Default      | Keterangan           |
| ---------------- | ------------ | -------------------- |
| `REDIS_URL`      | —            | Redis connection URL |
| `REDIS_HOST`     | `localhost`  | Redis host           |
| `REDIS_PORT`     | `6379`       | Redis port           |
| `REDIS_PASSWORD` | —            | Redis password       |
| `REDIS_DB`       | `0`          | Redis database index |
| `BULLMQ_PREFIX`  | `fintech-ai` | BullMQ key prefix    |

`REDIS_URL` mendukung:

- `redis://`
- `rediss://` untuk koneksi TLS

Jika `REDIS_URL` tersedia, URL tersebut digunakan sebagai konfigurasi utama. Jika tidak, aplikasi menggunakan host, port, password, dan database index.

Production wajib mengatur Redis secara eksplisit.

Redis digunakan untuk:

- BullMQ jobs.
- Rate limiting.
- Temporary application state.
- Queue processing dan recovery.

Redis merupakan dependency runtime wajib untuk konfigurasi aplikasi saat ini.

## 6. Email

```dotenv
RESEND_API_KEY=
EMAIL_FROM=
```

Email verification dan email delivery memerlukan konfigurasi provider yang valid.

Jangan menganggap email berhasil dikirim hanya karena job berhasil dimasukkan ke queue.

## 7. Midtrans

```dotenv
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
```

Gunakan sandbox credentials untuk development dan staging.

Jangan menggunakan production credentials untuk pengujian lokal.

## 8. Telegram

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_URL=
```

Konfigurasi hanya diperlukan ketika integrasi Telegram diaktifkan.

Webhook harus menggunakan URL publik HTTPS pada environment yang mendukung webhook eksternal.

## 9. AI

AI integration tetap disabled secara default.

```dotenv
AI_ENABLED=false
AI_PROVIDER=none
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
AI_TIMEOUT_MS=30000
```

Ketika AI diaktifkan, konfigurasi provider, API key, base URL, model, dan timeout wajib valid.

Provider yang saat ini didukung:

- `none`
- `openai-compatible`

Timeout harus berupa integer positif dan maksimal 300000 ms.

## 10. Production validation

Ketika `NODE_ENV=production`:

- JWT secrets wajib memenuhi panjang minimum dan berbeda.
- Frontend URL wajib HTTPS.
- Redis URL atau Redis host harus ditentukan secara eksplisit.
- Secret wajib berasal dari environment secret manager.
- Jangan memasukkan `.env` production ke repository.

## 11. Health endpoints

| Endpoint               | Fungsi                        |
| ---------------------- | ----------------------------- |
| `/api/v1/health/live`  | Process liveness              |
| `/api/v1/health/ready` | Database dan Redis readiness  |
| `/api/v1/health`       | Backward-compatible readiness |

Liveness tidak membuktikan bahwa dependency eksternal siap.

Readiness saat ini memeriksa PostgreSQL dan Redis.

## 12. Verification

Jalankan dari direktori backend:

```bash
npx prisma validate --schema src/database/prisma/schema.prisma
npm run build
npm test -- --runInBand
npm run test:e2e
```

Validasi environment saat startup juga harus berhasil pada target environment yang akan digunakan.

## 13. Deployment boundary

Dokumentasi ini tidak menyatakan bahwa aplikasi sudah di-deploy.

Cloud deployment tetap ditunda sampai hosting, database, Redis, secrets, monitoring, backup, dan rollback telah diverifikasi.
