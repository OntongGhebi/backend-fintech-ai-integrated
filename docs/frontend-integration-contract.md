# Frontend Integration Contract

Dokumen ini menjadi acuan integrasi frontend dengan Fintech AI Integrated Backend.

Kontrak harus mengikuti implementasi controller, DTO, dan Swagger. Jika dokumentasi ini berbeda dengan response aktual endpoint, implementasi backend dan Swagger menjadi sumber verifikasi utama.

## 1. API base URL

Development:

```text
http://localhost:3000/api/v1
```

Production:

```text
https://<backend-domain>/api/v1
```

Swagger:

```text
http://localhost:3000/docs
```

Swagger hanya diaktifkan ketika aplikasi berjalan bukan dalam mode production.

Global API prefix berasal dari `API_PREFIX`, dengan default `api/v1`.

Frontend harus menggunakan satu konfigurasi API base URL. Jangan menyusun URL endpoint secara berbeda-beda di setiap halaman.

## 2. Request headers

Request JSON:

```http
Content-Type: application/json
Accept: application/json
```

Authenticated request:

```http
Authorization: Bearer <accessToken>
```

Backend mengembalikan request identifier melalui:

```http
x-request-id: <request-id>
```

Frontend dapat menyimpan request ID tersebut pada log client untuk membantu investigasi error.

Jangan mengirim access token atau refresh token ke console log, analytics, URL query, atau telemetry yang tidak terpercaya.

## 3. Authentication contract

Autentikasi menggunakan JWT access token dan refresh token.

Backend tidak menggunakan cookie sebagai mekanisme utama autentikasi.

### Register

```http
POST /auth/register
```

Request:

```json
{
  "name": "Example User",
  "email": "user@example.com",
  "password": "ExamplePassword123!"
}
```

Gunakan field dan aturan validasi yang tercantum pada `RegisterDto` dan Swagger.

### Verify email

```http
POST /auth/verify-email
```

Request:

```json
{
  "token": "<verification-token>"
}
```

### Login

```http
POST /auth/login
```

Request:

```json
{
  "email": "user@example.com",
  "password": "ExamplePassword123!"
}
```

Response:

```json
{
  "accessToken": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": {
    "id": "<user-uuid>",
    "email": "user@example.com",
    "name": "Example User",
    "emailVerified": true
  }
}
```

Frontend menggunakan:

- `accessToken` untuk `Authorization: Bearer`.
- `refreshToken` untuk mendapatkan pasangan token baru.
- `user` untuk initial authenticated-user state.

### Current user

```http
GET /auth/me
Authorization: Bearer <accessToken>
```

Gunakan endpoint ini untuk memulihkan informasi user ketika aplikasi memulai authenticated session.

Jangan mempercayai data profil yang hanya berasal dari local storage.

### Refresh token

```http
POST /auth/refresh
Content-Type: application/json
```

Request:

```json
{
  "refreshToken": "<current-refresh-token>"
}
```

Response:

```json
{
  "accessToken": "<new-access-token>",
  "refreshToken": "<new-refresh-token>"
}
```

Refresh token dirotasi setiap kali refresh berhasil.

Frontend wajib mengganti refresh token lama dengan refresh token terbaru. Jangan menggunakan token lama setelah response refresh berhasil.

Refresh token rotation menggunakan operasi atomik. Jika dua refresh request memakai refresh token yang sama secara bersamaan, hanya satu yang dapat berhasil.

Karena itu frontend wajib menerapkan single-flight refresh:

1. Ketika beberapa request menerima 401 karena access token kedaluwarsa, hanya satu refresh request yang boleh berjalan.
2. Request lain menunggu hasil refresh yang sama.
3. Setelah berhasil, request yang dapat diulang dikirim ulang dengan access token baru.
4. Jangan melakukan retry refresh tanpa batas.
5. Jika refresh gagal dengan 401, hapus authenticated state dan arahkan user ke login.

### Logout

```http
POST /auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Request:

```json
{
  "refreshToken": "<current-refresh-token>"
}
```

Logout mencabut sesi yang terkait dengan access token dan refresh token yang diberikan.

Setelah logout berhasil, frontend harus menghapus token dan authenticated-user state.

## 4. Token lifecycle

Default konfigurasi:

| Token         | Default lifetime |
| ------------- | ---------------- |
| Access token  | 15 menit         |
| Refresh token | 7 hari           |

Nilai aktual mengikuti `JWT_ACCESS_EXPIRES_IN` dan `JWT_REFRESH_EXPIRES_IN`.

Ketentuan integrasi:

- Access token hanya digunakan pada Authorization header.
- Refresh token dikirim melalui body endpoint refresh/logout.
- Refresh token harus selalu diperbarui setelah rotasi berhasil.
- Jangan menjalankan beberapa refresh request paralel.
- Jangan melakukan infinite retry ketika menerima 401.
- Jangan menyimpan token di URL, query parameter, atau browser logs.
- Seluruh token harus dihapus ketika logout atau refresh ditolak.

## 5. Successful response contract

Backend tidak menerapkan global success envelope yang membungkus seluruh response menjadi:

```json
{
  "success": true,
  "data": {}
}
```

Response sukses mengikuti return value masing-masing controller dan response DTO.

Frontend harus membaca struktur berdasarkan endpoint yang dipanggil.

Jangan menambahkan asumsi bahwa setiap response memiliki properti `data`, `items`, `meta`, atau `pagination`.

Untuk daftar data, pagination dan filter mengikuti DTO endpoint terkait.

## 6. Error response contract

Error response memiliki struktur:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid request",
  "error": "Bad Request",
  "path": "/api/v1/transactions",
  "requestId": "<request-id>",
  "timestamp": "2026-11-24T10:00:00.000Z"
}
```

Tipe `message` dapat berupa string atau array string.

Contoh validation error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": ["email must be an email", "password should not be empty"],
  "error": "Bad Request",
  "path": "/api/v1/auth/login",
  "requestId": "<request-id>",
  "timestamp": "2026-11-24T10:00:00.000Z"
}
```

HTTP 5xx menggunakan pesan generik:

```json
{
  "success": false,
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error",
  "path": "/api/v1/example",
  "requestId": "<request-id>",
  "timestamp": "2026-11-24T10:00:00.000Z"
}
```

Frontend tidak boleh mengandalkan detail internal dari response 5xx.

### Error handling guidance

| Status  | Penanganan frontend                                              |
| ------- | ---------------------------------------------------------------- |
| 400     | Tampilkan validation atau business error                         |
| 401     | Jalankan satu proses refresh; jika gagal, akhiri session         |
| 403     | Tampilkan pesan akses ditolak                                    |
| 404     | Tampilkan resource tidak ditemukan                               |
| 409     | Tampilkan conflict atau state terbaru                            |
| 422     | Tampilkan validation/business error jika endpoint menggunakannya |
| 429     | Hormati rate limit dan `Retry-After` jika tersedia               |
| 500–599 | Tampilkan pesan generik dan catat request ID                     |

Status aktual tetap mengikuti response endpoint.

## 7. Request validation

Backend menggunakan global ValidationPipe dengan:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `forbidUnknownValues: true`
- `transform: true`
- `validationError.target: false`
- `validationError.value: false`

Konsekuensinya:

- Jangan mengirim properti tambahan yang tidak terdapat pada DTO.
- Jangan mengirim `userId` untuk menentukan pemilik data.
- Jangan mengirim field internal database.
- Gunakan UUID untuk resource identifier.
- Ikuti enum yang tercantum pada Swagger.
- Kirim angka dan tanggal sesuai tipe DTO endpoint.

## 8. Ownership and data isolation

Data privat selalu diakses berdasarkan authenticated user dari access token.

Frontend tidak boleh menentukan kepemilikan resource menggunakan `userId` dari local storage atau request body.

Untuk operasi update/delete, kirim identifier resource yang benar. Backend tetap bertanggung jawab memverifikasi kepemilikan resource tersebut.

Jangan menganggap resource ID yang valid berarti user berhak mengaksesnya.

## 9. Domain endpoint groups

API dikelompokkan berdasarkan domain berikut:

| Domain                 | Base path                 | Kegunaan                                       |
| ---------------------- | ------------------------- | ---------------------------------------------- |
| Authentication         | `/auth`                   | Register, login, refresh, logout, current user |
| Users                  | `/users`                  | Profil, preferensi, password, session          |
| Accounts               | `/accounts`               | Financial accounts dan balance                 |
| Transactions           | `/transactions`           | Income, expense, transfer, history             |
| Categories             | `/categories`             | Kategori transaksi                             |
| Budgets                | `/budgets`                | Budget dan allocation                          |
| Budget Alerts          | `/budget-alerts`          | Alert pengeluaran dan budget                   |
| Recurring Transactions | `/recurring-transactions` | Recurring rules dan execution                  |
| Dashboard              | `/dashboard`              | Dashboard summaries                            |
| Reports                | `/reports`                | Financial reports dan export                   |
| Notifications          | `/notifications`          | Notification list dan read status              |
| Financial Analysis     | `/financial-analysis`     | Analysis, recommendation, lifecycle            |
| AI                     | `/ai`                     | AI conversation dan insights                   |
| Plans                  | `/plans`                  | Subscription plans                             |
| Subscriptions          | `/subscriptions`          | Subscription lifecycle                         |
| Payments               | `/payments`               | Checkout dan payment history                   |
| Telegram               | `/telegram`               | Account linking dan webhook integration        |

Daftar endpoint, method, request DTO, response DTO, query parameter, dan status code yang tepat harus diambil dari Swagger.

## 10. Date, timezone, and currency

Application timezone:

```text
Asia/Jakarta
```

Supported currency:

```text
IDR
```

Ketentuan frontend:

- Jangan mengasumsikan timezone browser sama dengan timezone aplikasi.
- Tampilkan tanggal sesuai kontrak endpoint.
- Bedakan date-only value dan timestamp ISO 8601.
- Ikuti format `YYYY-MM-01` untuk filter bulan pada endpoint yang mensyaratkannya.
- Jangan mengubah tanggal date-only menjadi UTC timestamp tanpa alasan.
- Jangan melakukan operasi finansial menggunakan floating-point arithmetic yang tidak aman.
- Format tampilan mata uang menggunakan IDR.

## 11. Pagination and filters

Pagination tidak boleh diasumsikan seragam untuk seluruh domain.

Contoh:

- Notifications menggunakan pagination.
- Transactions menggunakan filter tanggal dan pagination.
- Budgets tidak menggunakan pagination pada kontrak yang diaudit.
- Endpoint lain mengikuti query DTO masing-masing.

Gunakan parameter yang tercantum pada Swagger. Jangan menambahkan query parameter yang tidak didukung DTO.

## 12. CORS and browser integration

Backend mengizinkan frontend origin yang dikonfigurasi melalui `FRONTEND_URL`.

Development:

```dotenv
FRONTEND_URL=http://localhost:5173
```

Production:

```dotenv
FRONTEND_URL=https://app.example.com
```

CORS menggunakan credentials mode pada konfigurasi backend, tetapi autentikasi aplikasi tetap menggunakan Bearer access token dan refresh token dalam request body.

Jangan mengasumsikan browser cookie authentication tersedia.

## 13. Health and availability

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

Gunakan liveness untuk mengetahui apakah proses API masih hidup.

Gunakan readiness untuk mengetahui apakah PostgreSQL dan Redis dapat dijangkau.

Health endpoint bukan pengganti validasi fitur bisnis.

## 14. Frontend integration checklist

### API client

- [ ] Base URL berasal dari environment frontend.
- [ ] Authorization header menggunakan access token.
- [ ] Content-Type JSON ditambahkan pada request JSON.
- [ ] Request ID dapat dibaca untuk troubleshooting.
- [ ] Error response ditangani berdasarkan `statusCode`.
- [ ] Tidak mengasumsikan success envelope global.

### Authentication

- [ ] Login menyimpan token sesuai auth storage adapter.
- [ ] Refresh menggunakan refresh token terbaru.
- [ ] Refresh dijalankan secara single-flight.
- [ ] Request yang dapat diulang hanya di-retry satu kali.
- [ ] Refresh 401 mengakhiri authenticated session.
- [ ] Logout menghapus token dan user state.
- [ ] Current-user state diverifikasi melalui `/auth/me`.

### Domain integration

- [ ] Accounts membaca data dan balance dari API.
- [ ] Transactions menggunakan query DTO yang didukung.
- [ ] Budgets membaca allocation sesuai periode.
- [ ] Notifications menggunakan pagination yang benar.
- [ ] Financial Analysis menggunakan lifecycle endpoint yang benar.
- [ ] Payment history menggunakan endpoint utama `/payments/me`.
- [ ] Endpoint legacy `/payments/history` tidak dijadikan kontrak baru.

### Financial correctness

- [ ] Nilai IDR diformat secara konsisten.
- [ ] Tidak ada perhitungan finansial kritis menggunakan floating-point yang tidak aman.
- [ ] Date-only tidak bergeser akibat konversi timezone.
- [ ] Data dashboard tidak dihitung ulang dengan asumsi yang berbeda dari backend.

## 15. Integration smoke test

Setelah frontend terhubung ke backend development:

1. Register dan verify email.
2. Login.
3. Ambil current user.
4. Buat dan baca account.
5. Buat income dan expense.
6. Periksa balance.
7. Buat transfer dan verifikasi kedua account.
8. Buat budget dan periksa allocation.
9. Baca transaction history.
10. Baca notifications dan unread count.
11. Baca financial analysis dan recommendations.
12. Jalankan refresh token.
13. Logout dan pastikan token lama tidak dapat dipakai.

Jalankan pengujian pada data development yang aman.

## 16. Integration boundary

Dokumen ini menyiapkan kontrak frontend dan backend.

Dokumen ini tidak menyatakan bahwa:

- Frontend sudah terhubung ke seluruh endpoint.
- External services sudah tersedia.
- Backend sudah di-deploy.
- Production credentials sudah dikonfigurasi.
- Production smoke test sudah dilakukan.

Integrasi aktual tetap memerlukan pengujian melalui frontend dan backend yang berjalan pada environment yang sama.
