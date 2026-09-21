-- Menu Vologda voting backend
-- Run in Supabase SQL editor once for a fresh project.

create extension if not exists pgcrypto;

create table if not exists public.vote_settings (
  id smallint primary key default 1 check (id = 1),
  is_open boolean not null default true,
  deadline timestamptz not null default '2026-10-10 14:00:00+00',
  admin_email text not null default 'admin@menuvologda.local',
  updated_at timestamptz not null default now()
);

insert into public.vote_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique check (char_length(device_id) between 8 and 200),
  selections text[] not null check (cardinality(selections) between 1 and 10),
  created_at timestamptz not null default now()
);

alter table public.vote_settings enable row level security;
alter table public.ballots enable row level security;

-- No direct table policies: all access goes through narrowly scoped RPC functions.
revoke all on public.vote_settings from anon, authenticated;
revoke all on public.ballots from anon, authenticated;

create or replace function public.is_menu_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = (
    select admin_email from public.vote_settings where id = 1
  );
$$;

create or replace function public.public_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_open', is_open,
    'deadline', deadline
  )
  from public.vote_settings
  where id = 1;
$$;

create or replace function public.has_voted(p_device_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.ballots where device_id = p_device_id
  );
$$;

create or replace function public.submit_vote(p_device_id text, p_selections text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_clean text[];
  v_open boolean;
begin
  select is_open into v_open from public.vote_settings where id = 1;
  if coalesce(v_open, false) is not true then
    raise exception 'VOTING_CLOSED';
  end if;

  if p_device_id is null or char_length(p_device_id) < 8 then
    raise exception 'INVALID_DEVICE';
  end if;

  select array_agg(x order by ord)
  into v_clean
  from (
    select distinct on (btrim(value)) btrim(value) as x, ord
    from unnest(p_selections) with ordinality as u(value, ord)
    where btrim(value) <> ''
    order by btrim(value), ord
  ) clean;

  if v_clean is null or cardinality(v_clean) < 1 or cardinality(v_clean) > 10 then
    raise exception 'INVALID_SELECTION_COUNT';
  end if;

  insert into public.ballots(device_id, selections)
  values (p_device_id, v_clean)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'ALREADY_VOTED';
end;
$$;

create or replace function public.admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_menu_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  select jsonb_build_object(
    'participants', count(*),
    'total_selections', coalesce(sum(cardinality(selections)), 0),
    'average_selections', coalesce(avg(cardinality(selections)), 0),
    'is_open', (select is_open from public.vote_settings where id = 1)
  )
  into v_result
  from public.ballots;

  return v_result;
end;
$$;

create or replace function public.admin_results()
returns table(snack_name text, votes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_menu_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  return query
  select choice as snack_name, count(*)::bigint as votes
  from public.ballots b
  cross join lateral unnest(b.selections) as choice
  group by choice
  order by votes desc, snack_name asc;
end;
$$;

create or replace function public.set_voting_state(p_is_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_menu_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  update public.vote_settings
  set is_open = p_is_open, updated_at = now()
  where id = 1;

  return p_is_open;
end;
$$;

revoke all on function public.is_menu_admin() from public;
revoke all on function public.public_status() from public;
revoke all on function public.has_voted(text) from public;
revoke all on function public.submit_vote(text, text[]) from public;
revoke all on function public.admin_summary() from public;
revoke all on function public.admin_results() from public;
revoke all on function public.set_voting_state(boolean) from public;

grant execute on function public.public_status() to anon, authenticated;
grant execute on function public.has_voted(text) to anon, authenticated;
grant execute on function public.submit_vote(text, text[]) to anon, authenticated;
grant execute on function public.is_menu_admin() to authenticated;
grant execute on function public.admin_summary() to authenticated;
grant execute on function public.admin_results() to authenticated;
grant execute on function public.set_voting_state(boolean) to authenticated;
