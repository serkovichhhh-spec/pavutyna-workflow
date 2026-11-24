-- Промокоди: реєстр кодів для блоку «Маєте промокод?» на pavutyna.ua і посилань pavutyna.ua/КОД.
-- Сайт (адмінка CTO «Налаштування → Редиректи») зберігає рядки «код адреса примітка».
-- Workspace веде реєстр: хто/де/навіщо, і для кожного коду створює трекінгове посилання
-- l.pavutyna.com/s/<source_code> (pvlinks.sources) — переходи рахуються в pvlinks.events (type='hit').
-- Людина вводить код на сайті → сайт редіректить на l.pavutyna.com/s/… → лічильник +1 → кінцева сторінка.

CREATE TABLE IF NOT EXISTS cmo.promo_codes(
 code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9-]{2,24}$'),     -- завжди ВЕЛИКИМИ, сайт регістр не розрізняє
 target_url text NOT NULL,                                     -- куди врешті має потрапити людина
 source_code text UNIQUE,                                      -- pvlinks.sources.code (трекінг)
 site_target text,                                             -- що реально стоїть в адмінці сайту (вносить керівник)
 channel text NOT NULL DEFAULT 'other' CHECK (channel IN ('zhk_chat','ooh','flyer','social','partner','sales','campaign','other')),
 zhk_source text,                                              -- pvlinks.sources.code чату ЖК (для Наді)
 ooh_id text REFERENCES cmo.ooh_placements(id) ON DELETE SET NULL, -- носій наружки (для Бориса)
 campaign text,                                                -- акція / кампанія
 offer text,                                                   -- що отримує людина (для ВП і бота)
 owner text,                                                   -- відповідальний у команді
 status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','live','paused','ended')),
 period_from date, period_to date,
 note text,
 created_at timestamptz NOT NULL DEFAULT now(), created_by text,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
);
ALTER TABLE cmo.promo_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cmo.promo_codes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS cmo.promo_settings(key text PRIMARY KEY, value text, updated_at timestamptz DEFAULT now(), updated_by text);
ALTER TABLE cmo.promo_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cmo.promo_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION cmo.promo_tracking(site_target text, source_code text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
 SELECT CASE
  WHEN site_target ~* 'l\.pavutyna\.com/s/' THEN jsonb_build_object('kind','source','key',lower(substring(site_target from '(?i)/s/([A-Za-z0-9_-]+)')))
  WHEN site_target ~* 'l\.pavutyna\.com/go/' THEN jsonb_build_object('kind','link','key',substring(site_target from '/go/([0-9]+)'))
  WHEN site_target IS NULL AND source_code IS NOT NULL THEN jsonb_build_object('kind','source','key',source_code)
  ELSE jsonb_build_object('kind','none') END
$$;

CREATE OR REPLACE FUNCTION cmo.promo_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE a jsonb := cmo.actor(); r jsonb := body->'item'; owner boolean; c text; cur cmo.promo_codes; src text; tgt text; tr jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Немає дозволу на цей Workspace' USING ERRCODE='42501'; END IF;
 owner := a->>'role'='owner';

 IF body->>'op'='list' THEN
  RETURN jsonb_build_object(
   'actor',a,'isOwner',owner,
   'items',COALESCE((SELECT jsonb_agg(x ORDER BY x->>'status'='ended', x->>'created_at' DESC) FROM (
     SELECT to_jsonb(p) || jsonb_build_object(
       'tracking',cmo.promo_tracking(p.site_target,p.source_code),
       'trackUrl',CASE WHEN p.source_code IS NOT NULL THEN 'https://l.pavutyna.com/s/'||p.source_code END,
       'ooh',(SELECT jsonb_build_object('id',o.id,'kind',o.kind,'code',o.code,'area',o.area,'address',o.address) FROM cmo.ooh_placements o WHERE o.id=p.ooh_id),
       'zhkName',(SELECT s.name FROM pvlinks.sources s WHERE s.code=p.zhk_source),
       'stats',(SELECT jsonb_build_object(
          'total',count(*),'d7',count(*) FILTER (WHERE e.ts>now()-interval '7 days'),'d30',count(*) FILTER (WHERE e.ts>now()-interval '30 days'),'last',max(e.ts))
         FROM pvlinks.events e, LATERAL (SELECT cmo.promo_tracking(p.site_target,p.source_code) t) q
         WHERE (q.t->>'kind'='source' AND e.type='hit' AND e.source=q.t->>'key')
            OR (q.t->>'kind'='link' AND e.type='click' AND e.link_id=(q.t->>'key')::int))
     ) x FROM cmo.promo_codes p) s),'[]'::jsonb),
   'zhk',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'cost',s.cost) ORDER BY s.name) FROM pvlinks.sources s
          WHERE s.code NOT LIKE 'promo-%' AND s.code NOT IN ('ig','fb','th','tg','qr')),'[]'::jsonb),
   'ooh',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'code',o.code,'area',o.area,'address',o.address,'status',o.status) ORDER BY o.kind DESC,o.sort,o.code) FROM cmo.ooh_placements o WHERE o.status<>'cancelled'),'[]'::jsonb),
   'team',COALESCE((SELECT jsonb_agg(m.name ORDER BY m.name) FROM cmo.members m WHERE m.active AND m.name NOT LIKE 'QA%' AND m.name<>'AI Office'),'[]'::jsonb),
   'settings',COALESCE((SELECT jsonb_object_agg(s.key,s.value) FROM cmo.promo_settings s),'{}'::jsonb));

 ELSIF body->>'op'='save' THEN
  c := upper(btrim(COALESCE(r->>'code','')));
  IF c !~ '^[A-Z0-9-]{2,24}$' THEN RAISE EXCEPTION 'Код: 2–24 символи, латиниця, цифри або дефіс'; END IF;
  tgt := btrim(COALESCE(r->>'target_url',''));
  IF tgt !~* '^https://' THEN RAISE EXCEPTION 'Вкажи повну адресу, куди веде код (https://…)'; END IF;
  SELECT * INTO cur FROM cmo.promo_codes WHERE code=c;
  IF FOUND THEN
   IF COALESCE(r->>'original','')<>c THEN RAISE EXCEPTION 'Код % уже зайнятий', c; END IF;
   IF NOT owner AND (cur.created_by IS DISTINCT FROM a->>'name' OR cur.status<>'new') THEN
    RAISE EXCEPTION 'Змінити код після внесення на сайт може лише керівник' USING ERRCODE='42501'; END IF;
  ELSIF NULLIF(r->>'original','') IS NOT NULL THEN
   RAISE EXCEPTION 'Перейменувати код не можна: створи новий, а старий заверши';
  END IF;
  src := COALESCE(cur.source_code,'promo-'||lower(c));
  INSERT INTO pvlinks.sources(code,name,target,note,cost) VALUES(src,'Промокод '||c,tgt,COALESCE(NULLIF(r->>'campaign',''),''),0)
   ON CONFLICT (code) DO UPDATE SET target=excluded.target,name=excluded.name,note=excluded.note;
  INSERT INTO cmo.promo_codes AS p(code,target_url,source_code,channel,zhk_source,ooh_id,campaign,offer,owner,period_from,period_to,note,created_by,updated_by)
  VALUES(c,tgt,src,COALESCE(NULLIF(r->>'channel',''),'other'),NULLIF(r->>'zhk_source',''),NULLIF(r->>'ooh_id',''),NULLIF(r->>'campaign',''),
   NULLIF(r->>'offer',''),COALESCE(NULLIF(r->>'owner',''),a->>'name'),NULLIF(r->>'period_from','')::date,NULLIF(r->>'period_to','')::date,NULLIF(r->>'note',''),a->>'name',a->>'name')
  ON CONFLICT (code) DO UPDATE SET target_url=excluded.target_url,channel=excluded.channel,zhk_source=excluded.zhk_source,ooh_id=excluded.ooh_id,
   campaign=excluded.campaign,offer=excluded.offer,owner=excluded.owner,period_from=excluded.period_from,period_to=excluded.period_to,note=excluded.note,
   updated_at=now(),updated_by=a->>'name';
  RETURN jsonb_build_object('code',c,'trackUrl','https://l.pavutyna.com/s/'||src);

 ELSIF body->>'op'='status' THEN
  IF NOT owner THEN RAISE EXCEPTION 'Статус коду змінює керівник' USING ERRCODE='42501'; END IF;
  c := upper(body->>'code');
  IF body->>'status' NOT IN ('new','live','paused','ended') THEN RAISE EXCEPTION 'Невідомий статус'; END IF;
  UPDATE cmo.promo_codes SET status=body->>'status',
   site_target=CASE WHEN body ? 'site_target' THEN NULLIF(btrim(body->>'site_target'),'') ELSE site_target END,
   updated_at=now(),updated_by=a->>'name' WHERE code=c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Код не знайдено'; END IF;
  RETURN jsonb_build_object('code',c);

 ELSIF body->>'op'='delete' THEN
  c := upper(body->>'code');
  SELECT * INTO cur FROM cmo.promo_codes WHERE code=c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Код не знайдено'; END IF;
  IF cur.status<>'new' THEN RAISE EXCEPTION 'Код уже на сайті — його можна лише завершити'; END IF;
  IF NOT owner AND cur.created_by IS DISTINCT FROM a->>'name' THEN RAISE EXCEPTION 'Видалити можна лише свій код' USING ERRCODE='42501'; END IF;
  DELETE FROM cmo.promo_codes WHERE code=c;
  DELETE FROM pvlinks.sources s WHERE s.code=cur.source_code AND NOT EXISTS (SELECT 1 FROM pvlinks.events e WHERE e.source=s.code);
  RETURN jsonb_build_object('code',c);

 ELSIF body->>'op'='setting' THEN
  IF NOT owner THEN RAISE EXCEPTION 'Налаштування змінює керівник' USING ERRCODE='42501'; END IF;
  IF body->>'key' NOT IN ('referral_bonus','referral_rule','sales_note') THEN RAISE EXCEPTION 'Невідоме налаштування'; END IF;
  INSERT INTO cmo.promo_settings(key,value,updated_at,updated_by) VALUES(body->>'key',body->>'value',now(),a->>'name')
   ON CONFLICT (key) DO UPDATE SET value=excluded.value,updated_at=now(),updated_by=excluded.updated_by;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Невідома дія';
END $$;
REVOKE ALL ON FUNCTION cmo.promo_action(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cmo.promo_action(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION api.cmo_promo(body jsonb) RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $$ SELECT cmo.promo_action(body) $$;
REVOKE ALL ON FUNCTION api.cmo_promo(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.cmo_promo(jsonb) TO authenticated;

-- Початкові дані: коди, які CTO вже вніс на сайт 24.11.2026.
INSERT INTO pvlinks.sources(code,name,target,note,cost) VALUES
 ('promo-7777','Промокод 7777','https://pavutyna.ua/ua/sg.html','Секретний Гігабіт',0)
ON CONFLICT (code) DO NOTHING;
INSERT INTO cmo.promo_codes(code,target_url,source_code,site_target,channel,campaign,offer,owner,status,note,created_by,updated_by) VALUES
 ('7777','https://pavutyna.ua/ua/sg.html','promo-7777','https://pavutyna.ua/ua/sg.html','campaign','Секретний Гігабіт',
  'Секретна сторінка, де замовляється тариф «Секретний Гігабіт»','Дмитро','live',
  'На сайті веде напряму, без лічильника. Щоб рахувати переходи — заміни в адмінці адресу на трекінгову.','Дмитро','Дмитро'),
 ('10G','https://pavutyna.ua/ua/Merezha-PAVUTYNA---Internet-shvydkist-do-25-Hbits-10GPON-XGS-PON-u-Kyievi.html',NULL,'https://l.pavutyna.com/go/22','campaign','10GPON',
  'Сторінка тарифу 10GPON','Дмитро','live',
  'Тестовий код CTO. go/22 рахує й кліки зі сторінки посилань, тому лічильник приблизний.','Дмитро','Дмитро')
ON CONFLICT (code) DO NOTHING;
INSERT INTO cmo.promo_settings(key,value,updated_by) VALUES
 ('referral_bonus','+400 бонусів після першого поповнення (уточнити в CTO: у чаті звучало +500 грн)','Дмитро'),
 ('referral_rule','Реферальні коди «Приведи друга» — 4–5 символів з цифр і літер A–F (як у посиланні pavutyna.ua/i/xxxxx). Реєструвати їх тут не треба: сайт розпізнає їх сам.','Дмитро'),
 ('sales_note','Якщо абонент називає код менеджеру або боту — знайди код у цьому списку й оформи те, що в колонці «Що отримує». Код запиши в коментар до заявки.','Дмитро')
ON CONFLICT (key) DO NOTHING;
