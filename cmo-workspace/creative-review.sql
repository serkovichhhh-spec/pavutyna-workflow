CREATE OR REPLACE FUNCTION cmo.creatives_approved(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM (
  SELECT DISTINCT ON (f->>'assetId') f FROM jsonb_array_elements(coalesce(p->'attachments','[]')) f
  WHERE f->>'creative'='true' AND f->>'status'<>'removed'
  ORDER BY f->>'assetId',(f->>'assetVersion')::integer DESC
 ) latest WHERE f->>'status' IS DISTINCT FROM 'ready' OR f->'review'->>'status' IS DISTINCT FROM 'approved')
$$;
REVOKE ALL ON FUNCTION cmo.creatives_approved(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.creatives_approved(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION cmo.guard_creative_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.workspace_key='pavutyna-cmo' AND NEW.lane IN ('ready','done') AND NOT cmo.creatives_approved(NEW.runtime_payload) THEN RAISE EXCEPTION 'Спочатку погодь актуальні версії креативів'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION cmo.guard_creative_approval() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS cmo_creative_approval_gate ON cmo.tasks;
CREATE TRIGGER cmo_creative_approval_gate BEFORE INSERT OR UPDATE ON cmo.tasks FOR EACH ROW EXECUTE FUNCTION cmo.guard_creative_approval();

CREATE OR REPLACE FUNCTION cmo.creative_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=cmo.actor(); t cmo.tasks; p jsonb; f jsonb; group_id text; ver integer; r jsonb; op text:=body->>'op'; event jsonb; rights jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Немає доступу' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND source_id=body->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Задача недоступна' USING ERRCODE='42501'; END IF;
 rights:=cmo.task_permissions(a,t.runtime_payload);
 IF NOT (rights->>'visible')::boolean THEN RAISE EXCEPTION 'Задача недоступна' USING ERRCODE='42501'; END IF;
 IF coalesce(body->>'version','')<>t.version::text THEN RAISE EXCEPTION 'Задачу вже змінено. Онови картку.' USING ERRCODE='40001'; END IF;
 p:=t.runtime_payload;
 IF op='prepare' THEN
  IF NOT (rights->>'work')::boolean THEN RAISE EXCEPTION 'Завантаження доступне виконавцю до здачі на рев’ю' USING ERRCODE='42501'; END IF;
  IF coalesce(body->>'mime','') NOT IN ('image/png','image/jpeg','image/webp','image/gif','video/mp4','application/pdf') THEN RAISE EXCEPTION 'Креатив: зображення, MP4 або PDF до 20 МБ'; END IF;
  group_id:=nullif(body->>'assetId','');ver:=1;
  IF group_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p->'attachments','[]')) x WHERE x->>'assetId'=group_id AND x->>'creative'='true' AND x->>'status'<>'removed') THEN RAISE EXCEPTION 'Матеріал не знайдено'; END IF;
   SELECT coalesce(max((x->>'assetVersion')::integer),0)+1 INTO ver FROM jsonb_array_elements(p->'attachments') x WHERE x->>'assetId'=group_id;
  END IF;
  r:=cmo.request(body||jsonb_build_object('op','attachment_prepare'));
  f:=r->'attachment';group_id:=coalesce(group_id,f->>'id');
  f:=f||jsonb_build_object('creative',true,'assetId',group_id,'assetVersion',ver,'review',jsonb_build_object('status','pending'));
  SELECT runtime_payload INTO p FROM cmo.tasks WHERE workspace_key=t.workspace_key AND source=t.source AND source_id=t.source_id;
  p:=jsonb_set(p,'{attachments}',(SELECT jsonb_agg(CASE WHEN x->>'id'=f->>'id' THEN f ELSE x END) FROM jsonb_array_elements(p->'attachments') x));
  UPDATE cmo.tasks SET runtime_payload=p WHERE workspace_key=t.workspace_key AND source=t.source AND source_id=t.source_id;
  RETURN r||jsonb_build_object('attachment',f);
 END IF;
 SELECT x INTO f FROM jsonb_array_elements(coalesce(p->'attachments','[]')) x WHERE x->>'id'=body->>'attachmentId' AND x->>'creative'='true' AND x->>'status'='ready';
 IF f IS NULL THEN RAISE EXCEPTION 'Версію не завантажено або файл недоступний'; END IF;
 IF op='review' THEN
  IF a->>'role'<>'owner' THEN RAISE EXCEPTION 'Погодження доступне керівнику' USING ERRCODE='42501'; END IF;
  IF coalesce(body->>'status','') NOT IN ('approved','changes') THEN RAISE EXCEPTION 'Невідоме рішення'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'attachments') x WHERE x->>'assetId'=f->>'assetId' AND x->>'status'<>'removed' AND (x->>'assetVersion')::integer>(f->>'assetVersion')::integer) THEN RAISE EXCEPTION 'Погоджувати можна лише актуальну версію'; END IF;
  IF body->>'status'='changes' AND length(trim(coalesce(body->>'text','')))=0 THEN RAISE EXCEPTION 'Опиши необхідні правки'; END IF;
  IF length(coalesce(body->>'text',''))>10000 THEN RAISE EXCEPTION 'Коментар надто довгий'; END IF;
  f:=f||jsonb_build_object('review',jsonb_build_object('status',body->>'status','by',a->>'name','at',now(),'note',coalesce(body->>'text','')));
  f:=f||jsonb_build_object('reviewHistory',coalesce(f->'reviewHistory','[]')||jsonb_build_array(f->'review'));
  IF body->>'status'='changes' THEN p:=p||jsonb_build_object('lane','todo','result',body->>'text'); END IF;
  event:=jsonb_build_object('action',CASE WHEN body->>'status'='approved' THEN 'Погоджено версію креативу' ELSE 'Правки до версії креативу' END,'note',f->>'name'||' · V'||(f->>'assetVersion'));
 ELSIF op='comment' THEN
  IF NOT (rights->>'comment')::boolean THEN RAISE EXCEPTION 'Коментарі недоступні' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(body->>'text',''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Перевір коментар'; END IF;
  IF (body ? 'x' OR body ? 'y') AND (f->>'mime' NOT LIKE 'image/%' OR body->>'x' IS NULL OR body->>'y' IS NULL OR (body->>'x')::numeric NOT BETWEEN 0 AND 100 OR (body->>'y')::numeric NOT BETWEEN 0 AND 100) THEN RAISE EXCEPTION 'Некоректна точка на зображенні'; END IF;
  IF body ? 'time' AND (f->>'mime'<>'video/mp4' OR (body->>'time')::numeric NOT BETWEEN 0 AND 86400) THEN RAISE EXCEPTION 'Некоректний таймкод'; END IF;
  IF jsonb_array_length(coalesce(f->'reviewComments','[]'))>=200 THEN RAISE EXCEPTION 'Максимум 200 коментарів до версії'; END IF;
  f:=f||jsonb_build_object('reviewComments',coalesce(f->'reviewComments','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'text',trim(body->>'text'),'author',a->>'name','at',now())));
  -- Only validated annotation coordinates are copied, never arbitrary client fields.
  f:=jsonb_set(f,ARRAY['reviewComments',(jsonb_array_length(f->'reviewComments')-1)::text],(f->'reviewComments'->(jsonb_array_length(f->'reviewComments')-1))||jsonb_strip_nulls(jsonb_build_object('x',body->'x','y',body->'y','time',body->'time')));
  event:=jsonb_build_object('action','Коментар до креативу','note',f->>'name'||' · V'||(f->>'assetVersion'));
 ELSE RAISE EXCEPTION 'Невідома дія'; END IF;
 p:=jsonb_set(p,'{attachments}',(SELECT jsonb_agg(CASE WHEN x->>'id'=f->>'id' THEN f ELSE x END) FROM jsonb_array_elements(p->'attachments') x));
 p:=p||jsonb_build_object('updatedAt',now(),'activity',coalesce(p->'activity','[]')||jsonb_build_array(event||jsonb_build_object('id',gen_random_uuid(),'at',now(),'actor',a->>'name','attachmentId',f->>'id')));
 UPDATE cmo.tasks SET runtime_payload=p,lane=p->>'lane',source_updated_at=now(),version=version+1 WHERE workspace_key=t.workspace_key AND source=t.source AND source_id=t.source_id;
 RETURN jsonb_build_object('id',t.source_id,'version',t.version+1);
END $$;
REVOKE ALL ON FUNCTION cmo.creative_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.creative_action(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION api.cmo_creative_action(body jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT cmo.creative_action(body) $$;
REVOKE ALL ON FUNCTION api.cmo_creative_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.cmo_creative_action(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
