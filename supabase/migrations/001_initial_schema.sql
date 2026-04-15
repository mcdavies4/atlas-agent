-- ============================================================
-- ATLAS AGENT — Supabase Schema v3
-- Sessions + Saved Addresses + Search History
-- ============================================================

create extension if not exists "pgcrypto";

-- Conversation sessions
create table if not exists sessions (
  phone        text primary key,
  state        text not null default 'IDLE',
  context_json jsonb default '{}',
  last_active  timestamptz default now()
);

-- Saved addresses per user
create table if not exists saved_addresses (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  label      text not null,
  address    text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(phone, label)
);

-- Search history per user
create table if not exists search_history (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null,
  pickup           text,
  dropoff          text,
  item_description text,
  city             text default 'Abuja',
  companies_found  integer default 0,
  top_company      text,
  created_at       timestamptz default now()
);

create index if not exists idx_sessions_phone        on sessions(phone);
create index if not exists idx_saved_addresses_phone on saved_addresses(phone);
create index if not exists idx_search_history_phone  on search_history(phone);
create index if not exists idx_search_history_date   on search_history(created_at desc);

-- ─── Feedback ────────────────────────────────────────────────────────────────
create table if not exists feedback (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null,
  rating           integer not null check (rating between 1 and 5),
  selected_company text,
  pickup           text,
  dropoff          text,
  city             text,
  created_at       timestamptz default now()
);
create index if not exists idx_feedback_phone on feedback(phone);

-- ─── Business Accounts ───────────────────────────────────────────────────────
create table if not exists business_accounts (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique,
  business_name   text not null,
  pickup_address  text not null,
  business_type   text,
  registered_at   timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_business_phone on business_accounts(phone);

-- ─── Company Suggestions ─────────────────────────────────────────────────────
create table if not exists company_suggestions (
  id           uuid primary key default gen_random_uuid(),
  suggested_by text not null,
  company_name text not null,
  phone        text,
  city         text,
  description  text,
  status       text default 'pending',  -- pending / approved / rejected
  created_at   timestamptz default now()
);
create index if not exists idx_suggestions_status on company_suggestions(status);

-- ─── User Preferences (preferred company etc) ────────────────────────────────
create table if not exists user_preferences (
  phone             text primary key,
  preferred_company text,
  language          text default 'english',  -- english / pidgin
  updated_at        timestamptz default now()
);

-- ─── Contact Book ─────────────────────────────────────────────────────────────
create table if not exists contact_book (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  name       text not null,
  address    text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(phone, name)
);
create index if not exists idx_contacts_phone on contact_book(phone);
