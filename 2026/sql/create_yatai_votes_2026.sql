-- yatai_votes_2026 テーブル作成スクリプト
-- Supabase SQL Editorで実行してください。

create table if not exists public.yatai_votes_2026 (
  id bigserial primary key,
  booth_id text not null,
  taste integer not null,
  service integer not null,
  visual integer not null,
  amount integer not null,
  comment text,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.yatai_votes_2026 enable row level security;

drop policy if exists "allow inserts from anon" on public.yatai_votes_2026;

create policy "allow inserts from anon"
  on public.yatai_votes_2026
  for insert
  to anon
  with check (true);
