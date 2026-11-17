# 🚀 High-Performance URL Shortener Backend

A scalable, production-grade URL Shortener & Real-Time Analytics API built with **NestJS**, **Prisma ORM**, **PostgreSQL**, **Redis**, and **BullMQ**. Designed for low-latency redirects, cache stampede prevention, background asynchronous ingestion, and real-time dashboard updates via Server-Sent Events (SSE).

---

## 🌐 Live Deployment & API Documentation

- **Interactive Swagger Docs:** [https://url-shortener-api-yoqz.onrender.com/docs](https://url-shortener-api-yoqz.onrender.com/docs)
- **Deployment Platform:** Render

> [!NOTE]
> **Cold Start Warning:** This application is deployed on Render's free tier. If the instance has been idle, the initial request may take **30–50 seconds** to wake up. Subsequent requests respond with sub-millisecond to low-millisecond latencies.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    Client["Client / Browser / Next.js"]

    subgraph API_Gateway ["NestJS Application (Render)"]
        Router["Controllers / Guards / Throttler"]
        AuthModule["Auth Module (JWT & Sessions)"]
        UrlsService["Urls Service"]
        SSE["SSE Stream (/urls/stats/clicks)"]
        AnalyticsService["Analytics Queue Producer"]
        Worker["Analytics Worker (BullMQ Processor)"]
    end

    subgraph Redis_Cluster ["Redis Cache & Broker"]
        Cache["KV Cache (url:shortCode)"]
        Queue["BullMQ Queue ('analytics')"]
        PubSub["Pub/Sub Channel (user:userId:clicks)"]
    end

    subgraph Database ["PostgreSQL (Prisma ORM)"]
        UsersTable["users"]
        AuthSessions["AuthSession"]
        UrlsTable["Url (redirectCount, indexes)"]
    end

    %% Redirect Flow
    Client -- "1. GET /urls/:code" --> Router
    Router --> UrlsService
    UrlsService -- "Cache Lookup" --> Cache
    UrlsService -. "Cache Miss" .-> UrlsTable
    UrlsService -- "Enqueue Redirect Job" --> AnalyticsService
    AnalyticsService -- "Add Job (<1ms)" --> Queue
    UrlsService -- "302 Redirect" --> Client

    %% Analytics & Ingestion Flow
    Queue -- "Fetch Job" --> Worker
    Worker -- "Atomic Increment redirectCount" --> UrlsTable
    Worker -- "Publish Click Event" --> PubSub

    %% Real-time SSE Flow
    PubSub -- "Push Event" --> SSE
    SSE -- "Stream Update (data: { clicks })" --> Client
```

---

## ⚡ Redis & BullMQ Deep Dive

The core design philosophy of this service is **never let analytics writes or database latencies block link redirection**.

### 1. Ultra-Fast Redirects with Multi-Layer Caching
When a user visits a shortened link (`GET /urls/:code`):
1. **Cache Lookaside:** Checks Redis key `url:<shortCode>` (1-hour TTL).
2. **Negative Caching:** If a code does not exist in the database, Redis stores `__URL_NOT_FOUND__`. This prevents **Cache Penetration** (attackers querying thousands of non-existent keys to exhaust database connections).
3. **Cache Stampede Prevention:** An in-memory `pendingLookups` Map deduplicates concurrent database queries for the same short code. While a database lookup is in-flight, subsequent requests for that short code share the same active `Promise` instead of hammering PostgreSQL.

### 2. Asynchronous Queue Processing (BullMQ)
Instead of executing an `UPDATE "Url"` query during the user's redirect request:
- `UrlsService.findOriginalUrl` immediately calls `analytics.trackRedirect(shortCode)`.
- BullMQ pushes an event to the `'analytics'` Redis queue in **under 1 millisecond**.
- The server responds with `HTTP 302 Redirect` instantly.
- **Resilience & Fault Tolerance:** Configured with 5 exponential backoff retries, persistent job tracking, and auto-cleanup for completed/failed jobs:
  ```ts
  await this.analyticsQueue.add('redirect', { shortCode }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
  });
  ```

### 3. Background Ingestion & Real-Time Analytics Pipeline
```
[Redirect Request]
       │
       ▼ (enqueue job)
[BullMQ 'analytics' Queue in Redis]
       │
       ▼ (worker picks up job)
[AnalyticsProcessor]
       │
       ├─► 1. Atomic PostgreSQL Update:
       │      UPDATE "Url" SET "redirectCount" = "redirectCount" + 1 WHERE "shortCode" = $1
       │
       └─► 2. Redis Pub/Sub Broadcast:
              PUBLISH user:<userId>:clicks {"shortCode":"...","clicks":N}
                     │
                     ▼
              [NestJS @Sse() Endpoint]
                     │
                     ▼ (Server-Sent Events)
              [Next.js Dashboard - Real-time In-place Counter Update]
```
- **PostgreSQL as Single Source of Truth:** Aggregations (`COUNT`, `SUM(redirectCount)`) are calculated cleanly via indexed `userId` queries.
- **Real-Time Streaming:** The Next.js dashboard connects to `/urls/stats/clicks` via native browser `EventSource`. When a link is clicked, the specific row and total clicks increment in real time without polling or full page refetches.

### 4. Dedicated Redis Connection Isolation
In modern Redis clients (`node-redis` v4+), once a client enters Pub/Sub subscriber mode via `.subscribe()`, it cannot execute regular commands (`GET`, `SET`, `INCR`).
- **`RedisService`** maintains two isolated connections:
  - **Primary Client:** Used for caching, deletions, counters, and `PUBLISH`.
  - **Subscriber Client (`client.duplicate()`):** Dedicated strictly to long-lived Pub/Sub subscriptions with automatic reconnection and listener cleanup on SSE client disconnect.

---

## 🔒 Authentication & Security Architecture

- **Dual-Token Authentication (JWT):**
  - **Access Token:** Short-lived JWT (15 minutes) passed via Bearer header or HTTP-only cookie (`path: '/'`).
  - **Refresh Token:** Long-lived JWT stored in an HTTP-only, secure cookie scoped strictly to `path: '/auth'`.
- **Database Session Invalidation:** Hashed refresh tokens are stored in the `AuthSession` table. Logging out or refreshing immediately invalidates sessions server-side.
- **Password Security:** Hashes passwords using **Argon2id** (the OWASP-recommended standard).
- **Optional Authentication on URL Creation:**
  - `@UseGuards(OptionalAccessTokenGuard)` allows unauthenticated visitors to create public short URLs anonymously.
  - If a valid access token or cookie is attached, the system extracts `userId` and associates the URL with their account.
- **Rate Limiting:** Guarded with `@nestjs/throttler` (global threshold + custom per-endpoint limits on URL creation).

---

## 🗄️ Database Schema (Prisma & PostgreSQL)

```prisma
model User {
  id           Int           @id @default(autoincrement())
  firstName    String        @db.VarChar(80)
  lastName     String        @db.VarChar(80)
  email        String        @unique @db.VarChar(254)
  passwordHash String        @db.VarChar(255)
  role         UserRole      @default(user)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  sessions     AuthSession[]
  urls         Url[]

  @@map("users")
}

model Url {
  id            Int      @id @default(autoincrement())
  userId        Int?
  originalUrl   String
  shortCode     String   @unique
  createdAt     DateTime @default(now())
  redirectCount Int      @default(0)

  user          User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model AuthSession {
  id               String    @id @default(cuid())
  userId           Int
  refreshTokenHash String
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
}
```

---

## 📡 API Endpoints Overview

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | None | Service health check |
| `POST` | `/auth/register` | None | Register a new user |
| `POST` | `/auth/login` | None | Authenticate & set HTTP-only cookies |
| `POST` | `/auth/refresh` | Cookie | Rotate refresh token and issue new access token |
| `POST` | `/auth/logout` | Cookie | Revoke session and clear cookies |
| `POST` | `/urls` | Optional | Create a shortened URL (associates user if token provided) |
| `GET` | `/urls/:code` | None | Redirects (302) to original URL & queues analytics |
| `GET` | `/urls/:code/stats` | None | Retrieve redirect count for a specific code |
| `GET` | `/urls` | Bearer/Cookie | Paginated list of URLs belonging to authenticated user |
| `GET` | `/urls/stats/dashboard` | Bearer/Cookie | Aggregated user metrics (`totalLinks`, `totalClicks`) |
| `GET` | `/urls/stats/clicks` | Bearer/Cookie | Server-Sent Events (SSE) real-time click stream |
| `GET` | `/urls/metrics/cache` | Bearer/Cookie | Redis cache hits, misses, and hit-rate percentage |

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (v20+)
- **Framework:** NestJS 11
- **Database:** PostgreSQL (via Prisma ORM 7 with `@prisma/adapter-pg`)
- **Caching & Pub/Sub:** Redis (`redis` v4+)
- **Queue / Background Jobs:** BullMQ
- **Authentication:** JWT (`@nestjs/jwt`), Argon2 (`argon2`), Cookie-Parser
- **API Docs:** Swagger / OpenAPI
- **Testing:** Vitest, Supertest
- **Linting & Formatting:** Oxlint, Prettier
- **Hosting:** Render

---

## 💻 Local Setup & Development

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<your-username>/url-shortner-backend.git
cd url-shortner-backend
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=3000
FRONTEND_URL=http://localhost:3001

# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/urlshortener?schema=public"

# Redis & BullMQ
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_TLS=false

# Authentication
JWT_ACCESS_SECRET="your-access-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"
JWT_ACCESS_TTL=900000        # 15 minutes (ms)
JWT_REFRESH_DAYS=604800000    # 7 days (ms)
```

### 3. Database Migrations
```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Run the Application
```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### 5. Running Tests & Linters
```bash
# Run unit & integration tests
npm test

# Run linter
npm run lint
```
Interactive Swagger UI will be available at `http://localhost:3000/docs`.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
