-- Наружка (OOH): реєстр банерів і білбордів. cmo.ooh_placements (RLS, без прямого доступу) + cmo.ooh_action (list / save).
-- Переглядають усі учасники; додають і редагують керівник, Борис (BTL/OOH) і Діана.
CREATE TABLE IF NOT EXISTS cmo.ooh_placements(
 id text PRIMARY KEY DEFAULT 'ooh-'||gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('banner','billboard','other')),
 code text,                 -- код площини агенції або № банера
 area text,                 -- район / СТ / ЖК
 address text,
 lat double precision, lng double precision,
 format text,               -- 6×3 щит / призма, банер на опорі…
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ordered','installed','active','removed','cancelled')),
 installed_on date, period_from date, period_to date,
 price numeric, contractor text, link text, photo text, note text,
 source text, sort int DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by text
);
ALTER TABLE cmo.ooh_placements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cmo.ooh_placements FROM anon, authenticated;

CREATE OR REPLACE FUNCTION cmo.ooh_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE a jsonb := cmo.actor(); r jsonb := body->'item'; can_edit boolean; nid text;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Немає дозволу на цей Workspace' USING ERRCODE='42501'; END IF;
 can_edit := a->>'role'='owner' OR a->>'name' IN ('Борис','Діана');
 IF body->>'op'='list' THEN
  RETURN jsonb_build_object('canEdit',can_edit,'items',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.kind DESC,p.sort,p.installed_on,p.code) FROM cmo.ooh_placements p),'[]'::jsonb));
 ELSIF body->>'op'='save' THEN
  IF NOT can_edit THEN RAISE EXCEPTION 'Редагувати наружку можуть керівник, Борис і Діана' USING ERRCODE='42501'; END IF;
  IF r IS NULL OR COALESCE(r->>'kind','') NOT IN ('banner','billboard','other') THEN RAISE EXCEPTION 'Вкажи тип носія'; END IF;
  INSERT INTO cmo.ooh_placements AS p(id,kind,code,area,address,lat,lng,format,status,installed_on,period_from,period_to,price,contractor,link,photo,note,source,updated_at,updated_by)
  VALUES(COALESCE(NULLIF(r->>'id',''),'ooh-'||gen_random_uuid()),r->>'kind',NULLIF(r->>'code',''),NULLIF(r->>'area',''),NULLIF(r->>'address',''),
   NULLIF(r->>'lat','')::double precision,NULLIF(r->>'lng','')::double precision,NULLIF(r->>'format',''),COALESCE(NULLIF(r->>'status',''),'planned'),
   NULLIF(r->>'installed_on','')::date,NULLIF(r->>'period_from','')::date,NULLIF(r->>'period_to','')::date,NULLIF(r->>'price','')::numeric,
   NULLIF(r->>'contractor',''),NULLIF(r->>'link',''),NULLIF(r->>'photo',''),NULLIF(r->>'note',''),COALESCE(NULLIF(r->>'source',''),'workspace'),now(),a->>'name')
  ON CONFLICT (id) DO UPDATE SET kind=excluded.kind,code=excluded.code,area=excluded.area,address=excluded.address,lat=excluded.lat,lng=excluded.lng,
   format=excluded.format,status=excluded.status,installed_on=excluded.installed_on,period_from=excluded.period_from,period_to=excluded.period_to,
   price=excluded.price,contractor=excluded.contractor,link=excluded.link,photo=excluded.photo,note=excluded.note,updated_at=now(),updated_by=a->>'name'
  RETURNING p.id INTO nid;
  RETURN jsonb_build_object('id',nid);
 END IF;
 RAISE EXCEPTION 'Невідома дія';
END $$;
REVOKE ALL ON FUNCTION cmo.ooh_action(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cmo.ooh_action(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION api.cmo_ooh(body jsonb) RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $$ SELECT cmo.ooh_action(body) $$;
REVOKE ALL ON FUNCTION api.cmo_ooh(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.cmo_ooh(jsonb) TO authenticated;
