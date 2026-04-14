-- ============================================================
-- ATLAS AGENT — Supabase Schema
-- Sessions only — no rider or delivery tables needed
-- ============================================================

create extension if not exists "pgcrypto";

-- Conversation sessions
create table if not exists sessions (
  phone        text primary key,
  state        text not null default 'IDLE',
  context_json jsonb default '{}',
  last_active  timestamptz default now()
);

create index if not exists idx_sessions_phone on sessions(phone);
