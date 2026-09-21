-- Menu Vologda voting backend
-- Apply once to a fresh Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.vote_settings (
  id smallint primary key default 1 check (id = 1),
  is_open boolean not null default true,
  deadline timestamptz not null default '2026-10-10 14:00:00+00',
  admin_password_hash text,
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

-- No direct table access from the browser. All reads/writes go through RPC functions.
revoke all on public.vote_settings from anon, authenticated;
revoke all on public.ballots from anon, authenticated;

create or replace function public.check_admin_password(p_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select admin_password_hash is not null
       and crypt(coalesce(p_password, ''), admin_password_hash) = admin_password_hash
     from public.vote_settings where id = 1),
    false
  );
$$;

create or replace function public.admin_login(p_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.check_admin_password(p_password);
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

  select array_agg(s.value order by s.first_ord)
  into v_clean
  from (
    select btrim(value) as value, min(ord) as first_ord
    from unnest(coalesce(p_selections, '{}'::text[])) with ordinality as u(value, ord)
    where value is not null
      and btrim(value) <> ''
      and char_length(btrim(value)) <= 120
    group by btrim(value)
  ) s;

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

create or replace function public.admin_summary(p_password text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.check_admin_password(p_password) then
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

create or replace function public.admin_results(p_password text)
returns table(snack_name text, votes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.check_admin_password(p_password) then
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

create or replace function public.set_voting_state(p_password text, p_is_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_admin_password(p_password) then
    raise exception 'ADMIN_ONLY';
  end if;

  update public.vote_settings
  set is_open = p_is_open, updated_at = now()
  where id = 1;

  return p_is_open;
end;
$$;

revoke all on function public.check_admin_password(text) from public;
revoke all on function public.admin_login(text) from public;
revoke all on function public.public_status() from public;
revoke all on function public.has_voted(text) from public;
revoke all on function public.submit_vote(text, text[]) from public;
revoke all on function public.admin_summary(text) from public;
revoke all on function public.admin_results(text) from public;
revoke all on function public.set_voting_state(text, boolean) from public;

grant execute on function public.public_status() to anon, authenticated;
grant execute on function public.has_voted(text) to anon, authenticated;
grant execute on function public.submit_vote(text, text[]) to anon, authenticated;
grant execute on function public.admin_login(text) to anon, authenticated;
grant execute on function public.admin_summary(text) to anon, authenticated;
grant execute on function public.admin_results(text) to anon, authenticated;
grant execute on function public.set_voting_state(text, boolean) to anon, authenticated;
