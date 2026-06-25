

## Table of Contents

1. System Overview
2. Tech Stack & Infrastructure
3. Database Schema
4. Backend — API Reference
5. Business Logic
6. Frontend — Admin Dashboard
7. Message Templates
8. Deployment Architecture
9. Environment Variables
10. Development Build Order

---

## 1. System Overview

### Purpose
A single internal admin system for Kurkees Peanut Butter to manage orders, automatically reward loyal customers with discount codes, and track a word-of-mouth referral programme. All WhatsApp messages are sent manually by the admin — the system generates the messages and queues them; the admin copies and sends them via WhatsApp, then marks them sent.

### Three Core Features

A. Order Management (OMS)
Create and manage customer orders through a simple status pipeline: Pending -> Confirmed -> Dispatched -> Delivered -> Cancelled. Marking an order Delivered is the trigger event for the loyalty discount system.

B. Loyalty Discount Codes
When an order is marked Delivered, the system calculates a discount tier based on the order total, generates a unique one-time code, and queues two WhatsApp messages: an initial delivery notification with the code, and a reminder 3 days before expiry. Codes are personal — only redeemable by the customer they were issued to.

C. Referral Programme
After an order is delivered, the admin can opt a customer into the referral programme. If they agree, they receive a shareable WhatsApp message template with their phone number embedded. When a new customer places an order and provides a referrer's phone number, both parties receive a discount. The same phone number pair can never receive referral benefits twice.

---

## 2. Tech Stack & Infrastructure

### Frontend
- Framework: Next.js 14 with App Router
- Styling: Tailwind CSS
- Auth: NextAuth.js v5 with credentials provider (email + password)
- State: React built-in state + SWR for data fetching
- Deployment: Vercel (Hobby Tier — Free)

### Backend
- Runtime: Node.js 20
- Framework: Express.js
- Deployment: AWS Lambda via Serverless Framework
- API exposure: AWS API Gateway (HTTP API)

### Database
- Engine: PostgreSQL 15
- Host: AWS RDS (db.t3.micro — Free Tier)
- Migrations: node-postgres (pg) with manual migration files run in order

### Infrastructure
- Vercel: Frontend hosting & CI/CD
- AWS Lambda: Backend API functions
- AWS API Gateway: HTTP API fronting Lambda
- AWS RDS: PostgreSQL database
- AWS Secrets Manager / SSM: Environment secrets

### Dev Tools
- Language: TypeScript throughout (frontend + backend)
- ORM: None — raw SQL via pg (node-postgres) for full control

---

## 3. Database Schema

Run migrations in the exact order listed. Each file is idempotent (uses IF NOT EXISTS).

### Migration 001 — customers
CREATE TABLE IF NOT EXISTS customers (
  phone        VARCHAR(20) PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  opted_in     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

### Migration 002 — orders
CREATE TYPE IF NOT EXISTS order_status AS ENUM (
  'pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'
);

CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone   VARCHAR(20) NOT NULL REFERENCES customers(phone),
  summary          TEXT NOT NULL,
  total_amount     INTEGER NOT NULL,
  discount_code    VARCHAR(20),
  discount_amount  INTEGER NOT NULL DEFAULT 0,
  final_amount     INTEGER NOT NULL,
  status           order_status NOT NULL DEFAULT 'pending',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  delivered_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

### Migration 003 — loyalty_codes
CREATE TABLE IF NOT EXISTS loyalty_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id),
  customer_phone   VARCHAR(20) NOT NULL REFERENCES customers(phone),
  code             VARCHAR(20) UNIQUE NOT NULL,
  discount_amount  INTEGER NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  used_on_order_id UUID REFERENCES orders(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_codes(customer_phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_code ON loyalty_codes(code);

### Migration 004 — referrals
CREATE TYPE IF NOT EXISTS referral_status AS ENUM (
  'pending', 'completed', 'invalid'
);

CREATE TABLE IF NOT EXISTS referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_phone    VARCHAR(20) NOT NULL REFERENCES customers(phone),
  referee_phone     VARCHAR(20) NOT NULL,
  status            referral_status NOT NULL DEFAULT 'pending',
  referrer_discount INTEGER,
  referee_discount  INTEGER,
  completed_order_id UUID REFERENCES orders(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  CONSTRAINT uq_referral_pair UNIQUE (referrer_phone, referee_phone),
  CONSTRAINT chk_no_self_referral CHECK (referrer_phone != referee_phone)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_phone);

### Migration 005 — message_queue
CREATE TYPE IF NOT EXISTS message_type AS ENUM (
  'loyalty_initial', 'loyalty_reminder', 'referral_optin', 'referral_share'
);

CREATE TABLE IF NOT EXISTS message_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone       VARCHAR(20) NOT NULL,
  to_name        VARCHAR(100),
  message_text   TEXT NOT NULL,
  type           message_type NOT NULL,
  reference_id   UUID,
  send_by        TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msgq_sent ON message_queue(sent_at);
CREATE INDEX IF NOT EXISTS idx_msgq_sendby ON message_queue(send_by);

---

## 4. Backend — API Reference

### Global Rule: Phone Normalization
Before saving or querying any phone number, the backend MUST strip all spaces, dashes, and country codes (e.g., +94). It must enforce exactly 10 digits starting with 07. (e.g., +94 77 123 4567 becomes 0771234567).

### Global Rule: Pagination
All GET list endpoints accept ?page=1&limit=50. Response payload for lists must be:
{
  "data": [ ... ],
  "meta": { "total": 100, "page": 1, "limit": 50 }
}

### 4.1 Customers API
- POST /customers : Validation: phone (string, 10 digits, starts with 07), name (string, max 100). Errors: 409 CUSTOMER_EXISTS
- GET /customers : Params: search (name/phone), page, limit.
- GET /customers/:phone : Returns customer with nested orders, loyalty_codes, and referrals_given.
- PATCH /customers/:phone : Update name or opted_in.

### 4.2 Orders API
- POST /orders : 
  Discount code validation (if provided):
  1. If Loyalty Code: Must exist, used_at null, not expired, customer_phone must match order. Set used_at = now().
  2. If Referral Phone: Must be valid customer, NOT equal to this order's phone. Pair must not exist in referrals DB. This customer must have NO previous delivered orders. Create referrals record (pending).
- GET /orders : Params: status, customer_phone, search, page, limit.
- PATCH /orders/:id : Updates status. 
  On transition to delivered: Run Delivery Trigger (Section 5.4).
  On transition to cancelled: Reverse used_at to null if a loyalty code was used.

### 4.3 Referrals API
- POST /referrals/optin : Queues a referral_optin message for a delivered customer.
- POST /referrals/confirm-optin : Sets opted_in = true, queues referral_share message.
- PATCH /referrals/:id : Admin can manually set status to invalid.

### 4.4 Message Queue API
- GET /messages : Params: status (pending/sent), type, page, limit.
  Sort: Pending sorted by send_by ASC NULLS LAST. Sent sorted by sent_at DESC. Compute is_overdue boolean.
- PATCH /messages/:id/sent : Sets sent_at = now().

---

## 5. Business Logic

### 5.1 Discount Tier Engine
const DISCOUNT_TIERS = [
  { minOrder: 3500, discountAmount: 400, expiryDays: 90 },
  { minOrder: 2000, discountAmount: 250, expiryDays: 60 },
  { minOrder: 1000, discountAmount: 150, expiryDays: 45 },
  { minOrder: 0,    discountAmount: 75,  expiryDays: 30 },
];

### 5.2 Code Generation
Format: KRK- + 5 random chars (Excluding O, 0, I, 1). Check DB for collisions. Max 5 retries.

### 5.3 Referral Discount Amounts
Referee (New customer): Rs 75 off current order.
Referrer: Rs 150 loyalty code (30 days expiry) sent upon referee's order creation.

### 5.4 Delivery Trigger (Single DB Transaction)
1. Fetch order -> Calculate tier.
2. Generate code.
3. INSERT loyalty_codes.
4. Build loyalty_initial message -> INSERT message_queue (send_by = today).
5. Build loyalty_reminder message -> INSERT message_queue (send_by = expires - 3 days).
6. UPDATE orders SET delivered_at = now().
Note: If any step fails, transaction rolls back.

---

## 6. Frontend — Admin Dashboard

Global Rule: Use date-fns-tz to force all UI dates/times to display in Asia/Colombo timezone, preventing UTC offset confusion.

### 6.1 Layout & Navigation
Sidebar with: Orders, Customers, Messages (shows pending badge), Referrals. Protected by NextAuth.

### 6.2 Orders Screen (/admin/orders)
Table with status tabs, search. "Mark Delivered" triggers confirmation modal.

### 6.3 Create / Edit Order (/admin/orders/new)
Form includes debounce-search for Customer. Discount section allows typing either a KRK code OR a friend's phone number. Compute final_amount dynamically on frontend.

### 6.4 Customers Screen (/admin/customers)
Displays "Referral opt-in" action buttons inside customer detail view.

### 6.5 Message Queue (/admin/messages)
"Pending" tab sorted by urgency (Overdue red, Today amber, Future muted). "Copy" button copies plain text. "Mark Sent" triggers optimistic UI update.

---

## 7. Message Templates

7.1 Loyalty Initial: "Hi [NAME]! ... Code: [CODE] Valid until: [EXPIRY_DATE]"
7.2 Loyalty Reminder: "Hi [NAME]! ... Your Rs [AMOUNT] discount code expires in 3 days!"
7.3 Referral Opt-in: "...Would you like to earn Rs 150 off your next order... Reply YES."
7.4 Referral Share: "Hey! I ordered Kurkees... mention my phone number [REFERRER_PHONE]..."
7.5 Referrer Reward: "...Someone you referred placed an order! Here is your Rs 150: [CODE]"

---

## 8. Deployment Architecture

### Architecture Diagram
Browser
  └── Vercel (Next.js SSR/App Router)
  └── API Gateway (HTTP API) → Lambda (Express.js)
                               └── RDS PostgreSQL (Private Subnet)

### Frontend Deployment (Vercel)
1. Push Next.js code to GitHub.
2. Connect repository to Vercel via Vercel Dashboard.
3. Vercel automatically builds and deploys (npm run build).
4. Zero configuration required for routing.

### Backend Deployment (AWS Serverless)
Uses Serverless Framework (serverless.yml). Express wrapped via serverless-http.
Note: Ensure Lambda is attached to the same VPC as RDS to allow DB connection. Outbound internet access is not required for Vercel/Lambda communication.

### CORS Configuration
Express must allow Origin: https://<your-vercel-project>.vercel.app (Methods: GET, POST, PATCH, OPTIONS).

---

## 9. Environment Variables

Backend (AWS SSM Parameter Store):
DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH.

Frontend (Vercel Dashboard Settings):
NEXT_PUBLIC_API_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

---

## 10. Development Build Order

1. Database & Migrations: Create DB, write schema, test migrate.ts script locally.
2. Backend Scaffolding: Express + JWT + Error Handlers.
3. Customers API: Phone normalization, CRUD, Pagination.
4. Orders API: Creation, Status transitions.
5. Delivery Trigger: DB Transaction, Code generation, Queuing logic.
6. Discount Validation: Apply KRK code or phone numbers at checkout.
7. Referrals API: Opt-in flows, referrer reward generation.
8. Message Queue API: List, sort by send_by, mark sent.
9. Frontend Scaffolding: Vercel deployment setup, NextAuth login, Sidebar layout.
10. Frontend Order UI: Listing, creation form, dynamic discount calculation.
11. Frontend Views: Customers, Referrals, Message Queue dashboards.
12. AWS Deployment: Deploy Lambda to VPC, configure RDS, map Vercel env variables.

---
