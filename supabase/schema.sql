-- Menu Vologda voting backend
-- Production schema. The admin password is generated/configured separately and is never committed to GitHub.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.vote_settings (
  id smallint primary key default 1 check (id = 1),
  is_open boolean not null default true,
  deadline timestamptz not null default '2026-10-10 14:00:00+00',
  admin_password_hash text,
  updated_at timestamptz not null default now()
);
insert into public.vote_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.snack_options (
  name text primary key,
  sort_order integer not null unique
);

insert into public.snack_options(name, sort_order) values
('Бутерброд с красной рыбой',1),
('Бутерброд со шпротами',2),
('Бутерброд с вялеными помидорами',3),
('Тарталетка с икрой и творожным сыром',4),
('Тарталетка с красной рыбой и творожным сыром',5),
('Тарталетка с креветкой',6),
('Рулетики из лаваша с форелью и огурцом',7),
('Рулетики из лаваша и крабовых палочек',8),
('Язык отварной, соус тартар',9),
('Рулетики из баклажанов',10),
('Рулетики из ветчины',11),
('Жульен в тарталетке',12),
('Рыба в кляре',13),
('Рыба под маринадом',14),
('Ассорти мясное',15),
('Ассорти рыбное',16),
('Ассорти овощное',17),
('Сырная тарелка',18),
('Шампиньоны фаршированные',19),
('Куриные рулетики с беконом',20),
('Голень, бедро жареные',21),
('Курица фаршированная',22),
('Крылышки остренькие в панировке, соус на выбор',23),
('Канапе на хлебе из селёдки и свёклы',24),
('Канапе на хлебе из селёдки и картошки',25),
('Канапе на шпажке овощное',26)
on conflict (name) do update set sort_order = excluded.sort_order;

create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique check (char_length(device_id) between 8 and 200),
  selections text[] not null check (cardinality(selections) between 1 and 10),
  created_at timestamptz not null default now()
);

alter table public.vote_settings enable row level security;
alter table public.snack_options enable row level security;
alter table public.ballots enable row level security;

revoke all on public.vote_settings from anon, authenticated;
revoke all on public.snack_options from anon, authenticated;
revoke all on public.ballots from anon, authenticated;

create or replace function public.check_admin_password(p_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select admin_password_hash is not null and coalesce(p_password,'') = admin_password_hash
     from public.vote_settings where id = 1),
    false
  );
$$;

create or replace function public.admin_login(p_password text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.check_admin_password(p_password);
$$;

create or replace function public.public_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('is_open', is_open and now()<deadline, 'deadline', deadline)
  from public.vote_settings where id=1;
$$;

create or replace function public.has_voted(p_device_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.ballots where device_id=p_device_id);
$$;

create or replace function public.submit_vote(p_device_id text,p_selections text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_clean text[]; v_open boolean; v_deadline timestamptz; v_invalid integer;
begin
  select is_open,deadline into v_open,v_deadline from public.vote_settings where id=1;
  if coalesce(v_open,false) is not true or now()>=v_deadline then raise exception 'VOTING_CLOSED'; end if;
  if p_device_id is null or char_length(p_device_id)<8 then raise exception 'INVALID_DEVICE'; end if;
  select array_agg(s.value order by s.first_ord) into v_clean from (
    select btrim(value) value,min(ord) first_ord
    from unnest(coalesce(p_selections,'{}'::text[])) with ordinality as u(value,ord)
    where value is not null and btrim(value)<>'' and char_length(btrim(value))<=120
    group by btrim(value)
  ) s;
  if v_clean is null or cardinality(v_clean)<1 or cardinality(v_clean)>10 then raise exception 'INVALID_SELECTION_COUNT'; end if;
  select count(*) into v_invalid from unnest(v_clean) c
    where not exists(select 1 from public.snack_options o where o.name=c);
  if v_invalid>0 then raise exception 'INVALID_SELECTION'; end if;
  insert into public.ballots(device_id,selections) values(p_device_id,v_clean) returning id into v_id;
  return v_id;
exception when unique_violation then raise exception 'ALREADY_VOTED'; end;
$$;

create or replace function public.admin_summary(p_password text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.check_admin_password(p_password) then raise exception 'ADMIN_ONLY'; end if;
  select jsonb_build_object(
    'participants',count(*),
    'total_selections',coalesce(sum(cardinality(selections)),0),
    'average_selections',coalesce(avg(cardinality(selections)),0),
    'is_open',(select is_open and now()<deadline from public.vote_settings where id=1)
  ) into v_result from public.ballots;
  return v_result;
end;
$$;

create or replace function public.admin_results(p_password text)
returns table(snack_name text,votes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.check_admin_password(p_password) then raise exception 'ADMIN_ONLY'; end if;
  return query
    select o.name,coalesce(v.cnt,0)::bigint
    from public.snack_options o
    left join (
      select choice,count(*) cnt
      from public.ballots b cross join lateral unnest(b.selections) choice
      group by choice
    ) v on v.choice=o.name
    order by coalesce(v.cnt,0) desc,o.sort_order asc;
end;
$$;

create or replace function public.admin_analytics(p_password text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_participants bigint;
  v_min integer;
  v_max integer;
  v_median numeric;
  v_full_ten bigint;
  v_below_ten bigint;
  v_distribution jsonb;
  v_first timestamptz;
  v_latest timestamptz;
begin
  if not public.check_admin_password(p_password) then raise exception 'ADMIN_ONLY'; end if;

  select
    count(*),
    min(cardinality(selections)),
    max(cardinality(selections)),
    percentile_cont(0.5) within group (order by cardinality(selections)),
    count(*) filter (where cardinality(selections)=10),
    count(*) filter (where cardinality(selections)<10),
    min(created_at),
    max(created_at)
  into v_participants,v_min,v_max,v_median,v_full_ten,v_below_ten,v_first,v_latest
  from public.ballots;

  select coalesce(jsonb_object_agg(selection_count::text,votes_count order by selection_count),'{}'::jsonb)
  into v_distribution
  from (
    select cardinality(selections) selection_count,count(*)::bigint votes_count
    from public.ballots
    group by cardinality(selections)
  ) d;

  return jsonb_build_object(
    'participants',coalesce(v_participants,0),
    'min_selections',coalesce(v_min,0),
    'max_selections',coalesce(v_max,0),
    'median_selections',coalesce(v_median,0),
    'full_ten_count',coalesce(v_full_ten,0),
    'below_ten_count',coalesce(v_below_ten,0),
    'selection_distribution',v_distribution,
    'first_vote_at',v_first,
    'latest_vote_at',v_latest
  );
end;
$$;

create or replace function public.set_voting_state(p_password text,p_is_open boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.check_admin_password(p_password) then raise exception 'ADMIN_ONLY'; end if;
  update public.vote_settings set is_open=p_is_open,updated_at=now() where id=1;
  return p_is_open;
end;
$$;

revoke all on function public.check_admin_password(text) from public;
revoke all on function public.admin_login(text) from public;
revoke all on function public.public_status() from public;
revoke all on function public.has_voted(text) from public;
revoke all on function public.submit_vote(text,text[]) from public;
revoke all on function public.admin_summary(text) from public;
revoke all on function public.admin_results(text) from public;
revoke all on function public.admin_analytics(text) from public;
revoke all on function public.set_voting_state(text,boolean) from public;

grant execute on function public.public_status() to anon,authenticated;
grant execute on function public.has_voted(text) to anon,authenticated;
grant execute on function public.submit_vote(text,text[]) to anon,authenticated;
grant execute on function public.admin_login(text) to anon,authenticated;
grant execute on function public.admin_summary(text) to anon,authenticated;
grant execute on function public.admin_results(text) to anon,authenticated;
grant execute on function public.admin_analytics(text) to anon,authenticated;
grant execute on function public.set_voting_state(text,boolean) to anon,authenticated;
