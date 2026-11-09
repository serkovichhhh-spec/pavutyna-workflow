-- Власна аналітика CMO Space замість Supermetrics (09.11.2026)
-- Джерела: Google Ads Script (у кабінеті 6825129974) і GA4 Apps Script пушать дані в edge-функцію mkt-ingest,
-- Meta пише Аналітик через конектор Meta Ads (mkt.meta_upsert). Зміни в Google Ads — черга mkt.ads_commands,
-- яку виконує той самий Google Ads Script.

create schema if not exists mkt;
revoke all on schema mkt from public, anon, authenticated;

create table if not exists mkt.ingest_keys(
  name text primary key, key_hash text not null unique, scopes text[] not null,
  active boolean not null default true, created_at timestamptz not null default now(), last_used_at timestamptz);

create table if not exists mkt.sync_runs(
  id bigserial primary key, source text not null, kind text, started_at timestamptz not null default now(),
  rows int, status text not null default 'ok', error text, meta jsonb);
create index if not exists sync_runs_source_idx on mkt.sync_runs(source, started_at desc);

-- Google Ads
create table if not exists mkt.gads_campaign_daily(
  date date not null, campaign_id bigint not null, campaign_name text, channel_type text,
  cost numeric(14,2) not null default 0, impressions bigint not null default 0, clicks bigint not null default 0,
  conversions numeric(12,2) not null default 0, conversions_value numeric(14,2) not null default 0,
  all_conversions numeric(12,2) not null default 0, updated_at timestamptz not null default now(),
  primary key(date, campaign_id));

create table if not exists mkt.gads_campaigns(
  campaign_id bigint primary key, name text not null, status text, primary_status text, primary_status_reasons text[],
  channel_type text, bidding_strategy_type text, target_cpa numeric, target_roas numeric,
  budget_id bigint, budget_amount numeric, budget_shared boolean, geo_target_type text, url_expansion_opt_out boolean,
  raw jsonb, updated_at timestamptz not null default now());

create table if not exists mkt.gads_search_terms(
  date date not null, campaign_id bigint not null, ad_group_id bigint not null, search_term text not null, status text,
  cost numeric(14,2) not null default 0, impressions bigint not null default 0, clicks bigint not null default 0,
  conversions numeric(12,2) not null default 0, updated_at timestamptz not null default now(),
  primary key(date, campaign_id, ad_group_id, search_term));

create table if not exists mkt.gads_conversion_actions(
  id bigint primary key, name text, category text, type text, status text, origin text,
  primary_for_goal boolean, include_in_conversions boolean, updated_at timestamptz not null default now());

create table if not exists mkt.gads_campaign_goals(
  campaign_id bigint not null, category text not null, origin text not null, biddable boolean,
  updated_at timestamptz not null default now(), primary key(campaign_id, category, origin));

-- GA4
create table if not exists mkt.ga4_traffic_daily(
  property_id text not null, date date not null, channel_group text not null, source_medium text not null,
  sessions int not null default 0, total_users int not null default 0, new_users int not null default 0,
  engaged_sessions int not null default 0, updated_at timestamptz not null default now(),
  primary key(property_id, date, channel_group, source_medium));

create table if not exists mkt.ga4_events_daily(
  property_id text not null, date date not null, event_name text not null, channel_group text not null, source_medium text not null,
  event_count int not null default 0, updated_at timestamptz not null default now(),
  primary key(property_id, date, event_name, channel_group, source_medium));

-- Meta (пише Аналітик із конектора Meta Ads)
create table if not exists mkt.meta_campaign_daily(
  account_id text not null, date date not null, campaign_id text not null, campaign_name text,
  spend numeric(14,2) not null default 0, impressions bigint not null default 0, reach bigint,
  clicks bigint not null default 0, link_clicks bigint, leads numeric(12,2), currency text,
  updated_at timestamptz not null default now(), primary key(account_id, date, campaign_id));

-- Черга змін у Google Ads
create table if not exists mkt.ads_commands(
  id bigserial primary key, platform text not null default 'gads', decision_id text, task_source_id text,
  op text not null, campaign_id bigint, campaign_name text, params jsonb not null default '{}',
  override boolean not null default false,
  status text not null default 'approved' check (status in ('approved','running','done','failed','rejected','cancelled')),
  requested_by text, note text, created_at timestamptz not null default now(), picked_at timestamptz, finished_at timestamptz,
  attempts int not null default 0, before jsonb, after jsonb, error text);
create index if not exists ads_commands_status_idx on mkt.ads_commands(status, id);

-- ───────── допоміжне ─────────
create or replace function mkt.check_key(p_key text, p_scope text) returns text
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare n text;
begin
  select name into n from mkt.ingest_keys
   where key_hash = encode(extensions.digest(coalesce(p_key,''), 'sha256'), 'hex') and active and p_scope = any(scopes);
  if n is null then raise exception 'Невірний ключ або немає доступу (%)', p_scope; end if;
  update mkt.ingest_keys set last_used_at = now() where name = n;
  return n;
end $$;

-- Оновлення розділу «Атрибуція» CMO Space з даних сховища (номери перезаписуються, note/owner/quality людей зберігаються)
create or replace function mkt.refresh_attribution(p_source text, p_months text[]) returns jsonb
language plpgsql security definer set search_path = mkt, cmo, pg_temp as $$
declare m text; recs jsonb := '[]'; ex jsonb; rid text; a record; cur jsonb; base jsonb;
begin
  select payload into cur from cmo.space_documents where key = 'attribution';
  foreach m in array coalesce(p_months, '{}'::text[]) loop
    continue when m > to_char(now() at time zone 'Europe/Kyiv', 'YYYY-MM');
    if p_source = 'gads' then
      select round(sum(cost),2) spend, sum(clicks) visits, round(sum(conversions),1) leads into a
        from mkt.gads_campaign_daily where to_char(date,'YYYY-MM') = m;
      rid := 'agent-gads-' || m;
      base := jsonb_build_object('source','Google Ads · ТОВ ПАВУТИНА. НЕТ','group','Paid','owner','Аналітик (Claude)',
        'quality','Немає даних','validLeads',null,'connections',null,'revenue',null,
        'note','Автосинхронізація з Google Ads Script. Візити = кліки, ліди = конверсії Google Ads, не звірені з ВП.');
    elsif p_source = 'meta' then
      select round(sum(spend),2) spend, coalesce(sum(link_clicks), sum(clicks)) visits, sum(leads) leads into a
        from mkt.meta_campaign_daily where account_id = '1424915349089632' and to_char(date,'YYYY-MM') = m;
      rid := 'agent-meta-' || m;
      base := jsonb_build_object('source','Meta Ads · PAVUTYNA Net','group','Paid','owner','Аналітик (Claude)',
        'quality','Немає даних','validLeads',null,'connections',null,'revenue',null,
        'note','Автосинхронізація з Meta Ads. Візити = переходи за посиланням, ліди — за атрибуцією Meta, не звірені з ВП.');
    else raise exception 'Невідоме джерело %', p_source; end if;
    continue when a.spend is null or (a.spend = 0 and coalesce(a.visits,0) = 0);
    select e into ex from jsonb_array_elements(coalesce(cur,'[]'::jsonb)) e where e->>'id' = rid;
    recs := recs || jsonb_build_array(base || (coalesce(ex,'{}'::jsonb) - 'agent' - 'agentUpdatedAt')
      || jsonb_build_object('id',rid,'month',m,'spend',a.spend,'visits',a.visits,'leads',a.leads,'syncedAt',now()));
  end loop;
  if jsonb_array_length(recs) = 0 then return '{"updated":0}'; end if;
  return cmo.agent_upsert('attribution', recs, 'mkt_sync');
end $$;

-- ───────── прийом даних від скриптів ─────────
create or replace function mkt.ingest(p_key text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare src text := p_payload->>'source'; f date := (p_payload#>>'{window,from}')::date; t date := (p_payload#>>'{window,to}')::date;
        n int := 0; c int; run_id bigint; months text[]; prop text := p_payload->>'property_id'; att jsonb; kname text;
begin
  if src not in ('gads','ga4') then raise exception 'Невідоме джерело %', src; end if;
  kname := mkt.check_key(p_key, src);
  if (f is null) <> (t is null) or f > t then raise exception 'Невірне вікно дат'; end if;
  insert into mkt.sync_runs(source, kind, meta) values (src, p_payload->>'kind',
    jsonb_build_object('window', p_payload->'window', 'key', kname)) returning id into run_id;

  if src = 'gads' then
    if p_payload ? 'campaign_daily' then
      if f is null then raise exception 'campaign_daily потребує window'; end if;
      delete from mkt.gads_campaign_daily where date between f and t;
      insert into mkt.gads_campaign_daily(date,campaign_id,campaign_name,channel_type,cost,impressions,clicks,conversions,conversions_value,all_conversions)
      select x.date,x.campaign_id,x.campaign_name,x.channel_type,coalesce(x.cost,0),coalesce(x.impressions,0),coalesce(x.clicks,0),
             coalesce(x.conversions,0),coalesce(x.conversions_value,0),coalesce(x.all_conversions,0)
        from jsonb_to_recordset(p_payload->'campaign_daily') as x(date date,campaign_id bigint,campaign_name text,channel_type text,
             cost numeric,impressions bigint,clicks bigint,conversions numeric,conversions_value numeric,all_conversions numeric)
       where x.date between f and t
      on conflict (date,campaign_id) do update set campaign_name=excluded.campaign_name, channel_type=excluded.channel_type,
        cost=excluded.cost, impressions=excluded.impressions, clicks=excluded.clicks, conversions=excluded.conversions,
        conversions_value=excluded.conversions_value, all_conversions=excluded.all_conversions, updated_at=now();
      get diagnostics c = row_count; n := n + c;
      select array_agg(distinct to_char(d,'YYYY-MM')) into months from generate_series(f, t, interval '1 day') d;
    end if;
    if p_payload ? 'search_terms' then
      if f is null then raise exception 'search_terms потребує window'; end if;
      delete from mkt.gads_search_terms where date between f and t;
      insert into mkt.gads_search_terms(date,campaign_id,ad_group_id,search_term,status,cost,impressions,clicks,conversions)
      select x.date,x.campaign_id,x.ad_group_id,x.search_term,x.status,coalesce(x.cost,0),coalesce(x.impressions,0),coalesce(x.clicks,0),coalesce(x.conversions,0)
        from jsonb_to_recordset(p_payload->'search_terms') as x(date date,campaign_id bigint,ad_group_id bigint,search_term text,status text,
             cost numeric,impressions bigint,clicks bigint,conversions numeric)
       where x.date between f and t and x.search_term is not null
      on conflict (date,campaign_id,ad_group_id,search_term) do update set status=excluded.status, cost=excluded.cost,
        impressions=excluded.impressions, clicks=excluded.clicks, conversions=excluded.conversions, updated_at=now();
      get diagnostics c = row_count; n := n + c;
    end if;
    if p_payload ? 'campaigns' then
      delete from mkt.gads_campaigns where campaign_id not in
        (select (e->>'campaign_id')::bigint from jsonb_array_elements(p_payload->'campaigns') e);
      insert into mkt.gads_campaigns(campaign_id,name,status,primary_status,primary_status_reasons,channel_type,bidding_strategy_type,
        target_cpa,target_roas,budget_id,budget_amount,budget_shared,geo_target_type,url_expansion_opt_out,raw)
      select x.campaign_id,x.name,x.status,x.primary_status,
             array(select jsonb_array_elements_text(coalesce(x.primary_status_reasons,'[]'::jsonb))),
             x.channel_type,x.bidding_strategy_type,x.target_cpa,x.target_roas,x.budget_id,x.budget_amount,x.budget_shared,
             x.geo_target_type,x.url_expansion_opt_out,x.raw
        from jsonb_to_recordset(p_payload->'campaigns') as x(campaign_id bigint,name text,status text,primary_status text,
             primary_status_reasons jsonb,channel_type text,bidding_strategy_type text,target_cpa numeric,target_roas numeric,
             budget_id bigint,budget_amount numeric,budget_shared boolean,geo_target_type text,url_expansion_opt_out boolean,raw jsonb)
      on conflict (campaign_id) do update set name=excluded.name,status=excluded.status,primary_status=excluded.primary_status,
        primary_status_reasons=excluded.primary_status_reasons,channel_type=excluded.channel_type,
        bidding_strategy_type=excluded.bidding_strategy_type,target_cpa=excluded.target_cpa,target_roas=excluded.target_roas,
        budget_id=excluded.budget_id,budget_amount=excluded.budget_amount,budget_shared=excluded.budget_shared,
        geo_target_type=excluded.geo_target_type,url_expansion_opt_out=excluded.url_expansion_opt_out,raw=excluded.raw,updated_at=now();
      get diagnostics c = row_count; n := n + c;
    end if;
    if p_payload ? 'conversion_actions' then
      delete from mkt.gads_conversion_actions where true;
      insert into mkt.gads_conversion_actions(id,name,category,type,status,origin,primary_for_goal,include_in_conversions)
      select * from jsonb_to_recordset(p_payload->'conversion_actions') as x(id bigint,name text,category text,type text,status text,
             origin text,primary_for_goal boolean,include_in_conversions boolean)
      on conflict (id) do nothing;
      get diagnostics c = row_count; n := n + c;
    end if;
    if p_payload ? 'campaign_goals' then
      delete from mkt.gads_campaign_goals where true;
      insert into mkt.gads_campaign_goals(campaign_id,category,origin,biddable)
      select * from jsonb_to_recordset(p_payload->'campaign_goals') as x(campaign_id bigint,category text,origin text,biddable boolean)
      on conflict do nothing;
      get diagnostics c = row_count; n := n + c;
    end if;
    if months is not null then att := mkt.refresh_attribution('gads', months); end if;

  elsif src = 'ga4' then
    if prop is null or f is null then raise exception 'ga4 потребує property_id і window'; end if;
    if p_payload ? 'traffic' then
      delete from mkt.ga4_traffic_daily where property_id = prop and date between f and t;
      insert into mkt.ga4_traffic_daily(property_id,date,channel_group,source_medium,sessions,total_users,new_users,engaged_sessions)
      select prop,x.date,coalesce(x.channel_group,'(not set)'),coalesce(x.source_medium,'(not set)'),
             sum(coalesce(x.sessions,0)),sum(coalesce(x.total_users,0)),sum(coalesce(x.new_users,0)),sum(coalesce(x.engaged_sessions,0))
        from jsonb_to_recordset(p_payload->'traffic') as x(date date,channel_group text,source_medium text,sessions int,total_users int,new_users int,engaged_sessions int)
       where x.date between f and t
       group by 1,2,3,4;
      get diagnostics c = row_count; n := n + c;
    end if;
    if p_payload ? 'events' then
      delete from mkt.ga4_events_daily where property_id = prop and date between f and t;
      insert into mkt.ga4_events_daily(property_id,date,event_name,channel_group,source_medium,event_count)
      select prop,x.date,x.event_name,coalesce(x.channel_group,'(not set)'),coalesce(x.source_medium,'(not set)'),sum(coalesce(x.event_count,0))
        from jsonb_to_recordset(p_payload->'events') as x(date date,event_name text,channel_group text,source_medium text,event_count int)
       where x.date between f and t and x.event_name is not null
       group by 1,2,3,4,5;
      get diagnostics c = row_count; n := n + c;
    end if;
  end if;

  update mkt.sync_runs set rows = n, meta = meta || jsonb_build_object('attribution', att) where id = run_id;
  return jsonb_build_object('ok', true, 'run_id', run_id, 'rows', n, 'attribution', att);
end $$;

-- Скрипт повідомляє про помилку
create or replace function mkt.ingest_error(p_key text, p_source text, p_error text) returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare kname text;
begin
  kname := mkt.check_key(p_key, p_source);
  insert into mkt.sync_runs(source, kind, status, error, meta) values (p_source, 'error', 'failed', left(p_error, 2000), jsonb_build_object('key', kname));
  return '{"ok":true}';
end $$;

-- Стан для скрипта (чи потрібен бекфіл / повна синхронізація сьогодні)
create or replace function mkt.sync_state(p_key text, p_source text) returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare r jsonb;
begin
  perform mkt.check_key(p_key, p_source);
  if p_source = 'gads' then
    select jsonb_build_object('min_date', min(date), 'max_date', max(date)) into r from mkt.gads_campaign_daily;
  else
    select jsonb_build_object('min_date', min(date), 'max_date', max(date)) into r from mkt.ga4_traffic_daily;
  end if;
  return r || jsonb_build_object('last_full_sync',
    (select max(started_at) from mkt.sync_runs where source = p_source and kind = 'full' and status = 'ok'),
    'today', (now() at time zone 'Europe/Kyiv')::date);
end $$;

-- ───────── Meta: пише Аналітик ─────────
create or replace function mkt.meta_upsert(p_payload jsonb, p_agent text default 'analyst') returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare f date := (p_payload#>>'{window,from}')::date; t date := (p_payload#>>'{window,to}')::date;
        acc text := coalesce(p_payload->>'account_id','1424915349089632'); c int; months text[]; att jsonb;
begin
  if f is null or t is null or f > t then raise exception 'Потрібне window {from,to}'; end if;
  delete from mkt.meta_campaign_daily where account_id = acc and date between f and t;
  insert into mkt.meta_campaign_daily(account_id,date,campaign_id,campaign_name,spend,impressions,reach,clicks,link_clicks,leads,currency)
  select acc,x.date,x.campaign_id,x.campaign_name,coalesce(x.spend,0),coalesce(x.impressions,0),x.reach,coalesce(x.clicks,0),x.link_clicks,x.leads,x.currency
    from jsonb_to_recordset(coalesce(p_payload->'rows','[]'::jsonb)) as x(date date,campaign_id text,campaign_name text,spend numeric,
         impressions bigint,reach bigint,clicks bigint,link_clicks bigint,leads numeric,currency text)
   where x.date between f and t
  on conflict (account_id,date,campaign_id) do update set campaign_name=excluded.campaign_name, spend=excluded.spend,
    impressions=excluded.impressions, reach=excluded.reach, clicks=excluded.clicks, link_clicks=excluded.link_clicks,
    leads=excluded.leads, currency=excluded.currency, updated_at=now();
  get diagnostics c = row_count;
  insert into mkt.sync_runs(source, kind, rows, meta) values ('meta', 'agent', c, jsonb_build_object('window', p_payload->'window', 'agent', p_agent));
  select array_agg(distinct to_char(d,'YYYY-MM')) into months from generate_series(f, t, interval '1 day') d;
  att := mkt.refresh_attribution('meta', months);
  return jsonb_build_object('rows', c, 'attribution', att);
end $$;

-- ───────── Черга змін у Google Ads ─────────
create or replace function mkt.command_add(p_records jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare r jsonb; c mkt.gads_campaigns; op text; err text; out jsonb := '[]'; inc numeric := 0; newb numeric; v numeric;
        st text; v_id bigint; ov boolean; cnt int;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'Потрібен масив команд'; end if;
  for r in select value from jsonb_array_elements(p_records) loop
    op := r->>'op'; err := null; c := null; ov := coalesce((r->>'override')::boolean, false);
    if op is null or op not in ('campaign_budget','campaign_status','target_cpa','geo_target_type','url_expansion',
                                'negative_keywords','conversion_goals','raw_mutate') then
      err := 'Невідома операція ' || coalesce(op,'(порожньо)');
    end if;
    if err is null and op <> 'raw_mutate' then
      if r ? 'campaign_id' then
        select * into c from mkt.gads_campaigns where campaign_id = (r->>'campaign_id')::bigint;
      else
        select count(*) into cnt from mkt.gads_campaigns where name = r->>'campaign_name';
        if cnt = 1 then select * into c from mkt.gads_campaigns where name = r->>'campaign_name'; end if;
      end if;
      if c.campaign_id is null then
        err := 'Кампанію «' || coalesce(r->>'campaign_name', r->>'campaign_id', '') || '» не знайдено однозначно — потрібна точна назва або campaign_id з mkt.gads_campaigns';
      end if;
    end if;
    if err is null then
      if op = 'campaign_budget' then
        newb := (r#>>'{params,daily}')::numeric;
        if newb is null or newb <= 0 then err := 'params.daily — новий денний бюджет у грн';
        elsif coalesce(c.budget_shared,false) and not ov then err := 'Спільний бюджет кількох кампаній — лише з override';
        elsif c.budget_amount is not null and newb > c.budget_amount * 1.2 and not ov then
          err := format('Підвищення бюджету понад +20%% (%s → %s грн) — потрібне пряме слово Діми (override)', c.budget_amount, newb);
        else
          inc := inc + greatest(newb - coalesce(c.budget_amount, newb), 0);
          if inc > 300 and not ov then err := 'Сумарне підвищення денних бюджетів за раз > 300 грн — потрібен override'; end if;
        end if;
      elsif op = 'campaign_status' then
        st := upper(coalesce(r#>>'{params,status}',''));
        if st not in ('PAUSED','ENABLED') then err := 'params.status: PAUSED або ENABLED';
        elsif st = 'ENABLED' and not ov then err := 'Увімкнення кампанії — лише з прямого слова Діми (override)'; end if;
      elsif op = 'target_cpa' then
        v := (r#>>'{params,uah}')::numeric;
        if v is null or v <= 0 then err := 'params.uah — цільова ціна конверсії в грн';
        elsif coalesce(c.bidding_strategy_type,'') not in ('MAXIMIZE_CONVERSIONS','TARGET_CPA') then
          err := 'tCPA можна змінити лише для MAXIMIZE_CONVERSIONS / TARGET_CPA (зараз ' || coalesce(c.bidding_strategy_type,'?') || ')'; end if;
      elsif op = 'geo_target_type' then
        if coalesce(r#>>'{params,positive}','') not in ('PRESENCE','PRESENCE_OR_INTEREST') then err := 'params.positive: PRESENCE або PRESENCE_OR_INTEREST'; end if;
      elsif op = 'url_expansion' then
        if coalesce(jsonb_typeof(r#>'{params,opt_out}'),'') <> 'boolean' then err := 'params.opt_out: true (вимкнути розширення URL) або false'; end if;
      elsif op = 'negative_keywords' then
        if coalesce(jsonb_typeof(r#>'{params,keywords}'),'') <> 'array' or jsonb_array_length(r#>'{params,keywords}') = 0 then err := 'params.keywords — непорожній масив';
        elsif coalesce(r#>>'{params,match}','PHRASE') not in ('EXACT','PHRASE','BROAD') then err := 'params.match: EXACT / PHRASE / BROAD'; end if;
      elsif op = 'conversion_goals' then
        if coalesce(jsonb_typeof(r#>'{params,goals}'),'') <> 'array' or jsonb_array_length(r#>'{params,goals}') = 0 then
          err := 'params.goals — масив {category, origin, biddable}'; end if;
      elsif op = 'raw_mutate' then
        if not ov then err := 'raw_mutate — лише з прямого слова Діми (override)';
        elsif coalesce(jsonb_typeof(r#>'{params,operations}'),'') <> 'array' then err := 'params.operations — масив операцій Google Ads API'; end if;
      end if;
    end if;
    insert into mkt.ads_commands(decision_id, task_source_id, op, campaign_id, campaign_name, params, override, status, requested_by, note, error, finished_at)
    values (r->>'decision_id', r->>'task_source_id', coalesce(op,'?'), c.campaign_id, coalesce(c.name, r->>'campaign_name'),
            coalesce(r->'params','{}'::jsonb), ov, case when err is null then 'approved' else 'rejected' end, p_actor, r->>'note', err,
            case when err is null then null else now() end)
    returning id into v_id;
    out := out || jsonb_build_object('id', v_id, 'op', op, 'campaign', coalesce(c.name, r->>'campaign_name'),
                                     'status', case when err is null then 'approved' else 'rejected' end, 'error', err);
  end loop;
  return jsonb_build_object('commands', out,
    'note', 'Схвалені команди виконує Google Ads Script (щогодини або кнопкою «Запустити» в кабінеті). Результат: select * from mkt.ads_commands where id in (...)');
end $$;

create or replace function mkt.command_cancel(p_id bigint, p_actor text) returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
begin
  update mkt.ads_commands set status = 'cancelled', finished_at = now(), error = 'Скасовано: ' || p_actor
   where id = p_id and status = 'approved';
  return jsonb_build_object('cancelled', found);
end $$;

create or replace function mkt.commands_pull(p_key text) returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare r jsonb;
begin
  perform mkt.check_key(p_key, 'gads_exec');
  update mkt.ads_commands set status = 'failed', finished_at = now(), error = 'Скрипт не повернув результат за 3 год'
   where status = 'running' and picked_at < now() - interval '3 hours';
  with picked as (
    update mkt.ads_commands set status = 'running', picked_at = now(), attempts = attempts + 1
     where id in (select id from mkt.ads_commands where status = 'approved' and platform = 'gads' order by id limit 20 for update skip locked)
    returning id, op, campaign_id, campaign_name, params)
  select coalesce(jsonb_agg(to_jsonb(picked) order by id), '[]') into r from picked;
  return r;
end $$;

create or replace function mkt.commands_report(p_key text, p_results jsonb) returns jsonb
language plpgsql security definer set search_path = mkt, pg_temp as $$
declare r jsonb; n int := 0;
begin
  perform mkt.check_key(p_key, 'gads_exec');
  for r in select value from jsonb_array_elements(coalesce(p_results,'[]')) loop
    update mkt.ads_commands set status = case when r->>'status' = 'done' then 'done' else 'failed' end,
      before = r->'before', after = r->'after', error = r->>'error', finished_at = now()
     where id = (r->>'id')::bigint and status = 'running';
    if found then n := n + 1; end if;
  end loop;
  return jsonb_build_object('updated', n);
end $$;

-- ───────── Вітрини для агентів і дашборду ─────────
create or replace view mkt.v_freshness as
select s.source,
       max(s.started_at) filter (where s.status = 'ok') as last_ok_at,
       round(extract(epoch from now() - max(s.started_at) filter (where s.status = 'ok')) / 3600, 1) as hours_since_ok,
       (array_agg(s.error order by s.started_at desc) filter (where s.status = 'failed'))[1] as last_error,
       max(s.started_at) filter (where s.status = 'failed') as last_error_at,
       case s.source when 'gads' then (select max(date) from mkt.gads_campaign_daily)
                     when 'ga4' then (select max(date) from mkt.ga4_traffic_daily)
                     when 'meta' then (select max(date) from mkt.meta_campaign_daily) end as data_to
  from mkt.sync_runs s where coalesce(s.kind,'') <> 'test' group by s.source;

create or replace view mkt.v_gads_daily as
select date, round(sum(cost),2) cost, sum(impressions) impressions, sum(clicks) clicks, round(sum(conversions),2) conversions,
       round(sum(cost)/nullif(sum(conversions),0),2) cpa
  from mkt.gads_campaign_daily group by date;

create or replace view mkt.v_gads_campaigns as
with kyiv as (select (now() at time zone 'Europe/Kyiv')::date as today)
select c.campaign_id, c.name, c.status, c.primary_status, c.primary_status_reasons, c.channel_type, c.bidding_strategy_type,
       c.target_cpa, c.budget_amount, c.budget_shared, c.geo_target_type, c.url_expansion_opt_out,
       round(sum(d.cost) filter (where d.date = k.today - 1),2) cost_yday,
       round(sum(d.cost) filter (where d.date >= k.today - 7),2) cost_7d,
       sum(d.clicks) filter (where d.date >= k.today - 7) clicks_7d,
       sum(d.impressions) filter (where d.date >= k.today - 7) impr_7d,
       round(sum(d.conversions) filter (where d.date >= k.today - 7),2) conv_7d,
       round(sum(d.cost) filter (where d.date >= k.today - 28),2) cost_28d,
       sum(d.clicks) filter (where d.date >= k.today - 28) clicks_28d,
       sum(d.impressions) filter (where d.date >= k.today - 28) impr_28d,
       round(sum(d.conversions) filter (where d.date >= k.today - 28),2) conv_28d,
       round(sum(d.cost) filter (where d.date >= k.today - 28) / nullif(sum(d.conversions) filter (where d.date >= k.today - 28),0),2) cpa_28d,
       round(100.0 * sum(d.clicks) filter (where d.date >= k.today - 28) / nullif(sum(d.impressions) filter (where d.date >= k.today - 28),0),2) ctr_28d
  from mkt.gads_campaigns c cross join kyiv k
  left join mkt.gads_campaign_daily d on d.campaign_id = c.campaign_id and d.date >= k.today - 28 and d.date < k.today
 group by c.campaign_id, c.name, c.status, c.primary_status, c.primary_status_reasons, c.channel_type, c.bidding_strategy_type,
          c.target_cpa, c.budget_amount, c.budget_shared, c.geo_target_type, c.url_expansion_opt_out;

create or replace view mkt.v_ga4_daily as
select t.date, sum(t.sessions) sessions, sum(t.total_users) users, sum(t.engaged_sessions) engaged_sessions,
       coalesce((select sum(e.event_count) from mkt.ga4_events_daily e where e.property_id = '348106289' and e.date = t.date and e.event_name = 'Order_All'),0) orders,
       coalesce((select sum(e.event_count) from mkt.ga4_events_daily e where e.property_id = '348106289' and e.date = t.date and e.event_name = 'Order_All'
                  and e.channel_group in ('Paid Search','Paid Social','Paid Other','Cross-network','Display','Paid Shopping','Paid Video')),0) paid_orders
  from mkt.ga4_traffic_daily t where t.property_id = '348106289' group by t.date;

create or replace view mkt.v_ga4_channels as
select date, channel_group, sum(sessions) sessions, sum(total_users) users
  from mkt.ga4_traffic_daily where property_id = '348106289' group by date, channel_group;

create or replace view mkt.v_monthly as
with g as (select to_char(date,'YYYY-MM') m, round(sum(cost),2) gads_cost, sum(clicks) gads_clicks, round(sum(conversions),1) gads_conv
             from mkt.gads_campaign_daily group by 1),
     me as (select to_char(date,'YYYY-MM') m, round(sum(spend),2) meta_spend, sum(coalesce(link_clicks,clicks)) meta_clicks, sum(leads) meta_leads
             from mkt.meta_campaign_daily group by 1),
     ga as (select to_char(date,'YYYY-MM') m, sum(sessions) sessions, sum(orders) orders, sum(paid_orders) paid_orders from mkt.v_ga4_daily group by 1)
select coalesce(g.m, me.m, ga.m) as month, g.gads_cost, g.gads_clicks, g.gads_conv, me.meta_spend, me.meta_clicks, me.meta_leads,
       ga.sessions, ga.orders, ga.paid_orders
  from g full join me on me.m = g.m full join ga on ga.m = coalesce(g.m, me.m);

revoke all on all tables in schema mkt from public, anon, authenticated;
revoke all on all functions in schema mkt from public, anon, authenticated;
