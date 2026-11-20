-- Наружка: фотозвіти до носіїв. Файли в приватному бакеті cmo-ooh-photos (<id носія>/<файл>),
-- список у cmo.ooh_placements.photos [{path,name,size,added_at,added_by}].
-- Бачать усі учасники Workspace; завантажують і видаляють керівник, Борис і Діана.
ALTER TABLE cmo.ooh_placements ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('cmo-ooh-photos','cmo-ooh-photos',false,15728640,ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION cmo.ooh_can_edit() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT COALESCE((SELECT a->>'role'='owner' OR a->>'name' IN ('Борис','Діана') FROM (SELECT cmo.actor() a) x WHERE a IS NOT NULL),false)
$$;
CREATE OR REPLACE FUNCTION cmo.ooh_is_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT cmo.actor() IS NOT NULL $$;
REVOKE ALL ON FUNCTION cmo.ooh_can_edit(), cmo.ooh_is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cmo.ooh_can_edit(), cmo.ooh_is_member() TO authenticated;

DROP POLICY IF EXISTS cmo_ooh_photo_read ON storage.objects;
DROP POLICY IF EXISTS cmo_ooh_photo_upload ON storage.objects;
DROP POLICY IF EXISTS cmo_ooh_photo_delete ON storage.objects;
CREATE POLICY cmo_ooh_photo_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='cmo-ooh-photos' AND cmo.ooh_is_member());
CREATE OR REPLACE FUNCTION cmo.ooh_photo_upload_ok(path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT cmo.ooh_can_edit() AND EXISTS(SELECT 1 FROM cmo.ooh_placements p WHERE p.id=split_part(path,'/',1))
$$;
REVOKE ALL ON FUNCTION cmo.ooh_photo_upload_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cmo.ooh_photo_upload_ok(text) TO authenticated;
CREATE POLICY cmo_ooh_photo_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='cmo-ooh-photos' AND cmo.ooh_photo_upload_ok(name));
CREATE POLICY cmo_ooh_photo_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='cmo-ooh-photos' AND cmo.ooh_can_edit());

CREATE OR REPLACE FUNCTION cmo.ooh_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE a jsonb := cmo.actor(); r jsonb := body->'item'; can_edit boolean; nid text; ph jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Немає дозволу на цей Workspace' USING ERRCODE='42501'; END IF;
 can_edit := a->>'role'='owner' OR a->>'name' IN ('Борис','Діана');
 IF body->>'op'='list' THEN
  RETURN jsonb_build_object('canEdit',can_edit,'items',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.kind DESC,p.sort,p.installed_on,p.code) FROM cmo.ooh_placements p),'[]'::jsonb));
 END IF;
 IF NOT can_edit THEN RAISE EXCEPTION 'Редагувати наружку можуть керівник, Борис і Діана' USING ERRCODE='42501'; END IF;
 IF body->>'op'='save' THEN
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
 ELSIF body->>'op'='photo_add' THEN
  -- файл уже має лежати в бакеті під <id>/...
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='cmo-ooh-photos' AND o.name=body->>'path' AND split_part(o.name,'/',1)=body->>'id') THEN
   RAISE EXCEPTION 'Фото ще не завантажено'; END IF;
  ph := jsonb_build_object('path',body->>'path','name',COALESCE(NULLIF(body->>'name',''),split_part(body->>'path','/',2)),
   'size',(SELECT (o.metadata->>'size')::bigint FROM storage.objects o WHERE o.bucket_id='cmo-ooh-photos' AND o.name=body->>'path'),
   'taken',NULLIF(body->>'taken',''),'added_at',now(),'added_by',a->>'name');
  UPDATE cmo.ooh_placements p SET photos=(SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(p.photos) x WHERE x->>'path'<>body->>'path')||jsonb_build_array(ph),
   updated_at=now(),updated_by=a->>'name' WHERE p.id=body->>'id';
  IF NOT FOUND THEN RAISE EXCEPTION 'Носій не знайдено'; END IF;
  RETURN jsonb_build_object('id',body->>'id','photo',ph);
 ELSIF body->>'op'='photo_remove' THEN
  UPDATE cmo.ooh_placements p SET photos=(SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(p.photos) x WHERE x->>'path'<>body->>'path'),
   updated_at=now(),updated_by=a->>'name' WHERE p.id=body->>'id';
  RETURN jsonb_build_object('id',body->>'id');
 END IF;
 RAISE EXCEPTION 'Невідома дія';
END $$;
REVOKE ALL ON FUNCTION cmo.ooh_action(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cmo.ooh_action(jsonb) TO authenticated;
