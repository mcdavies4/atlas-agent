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
