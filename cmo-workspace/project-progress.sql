-- Uses existing owner-only documents, CAS revisions, audit events and backups.
CREATE OR REPLACE FUNCTION cmo.project_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a jsonb:=cmo.actor(); k text:=body->>'key'; d cmo.space_documents; r jsonb; p jsonb; entry jsonb; pos integer; rev integer; idx integer; n integer; week text:=to_char(date_trunc('week',now() AT TIME ZONE 'Europe/Kyiv'),'YYYY-MM-DD');
BEGIN
 IF a IS NULL OR a->>'role'<>'owner' THEN RAISE EXCEPTION 'Огляд проєктів доступний керівнику' USING ERRCODE='42501'; END IF;
 IF k IS NULL OR k NOT IN ('campaigns','roadmap','execution') THEN RAISE EXCEPTION 'Невідомий тип проєкту'; END IF;
 SELECT * INTO d FROM cmo.space_documents WHERE key=k FOR UPDATE;
 IF NOT FOUND OR jsonb_typeof(d.payload)<>'array' THEN RAISE EXCEPTION 'Проєкти не знайдено'; END IF;
 rev:=(body->>'revision')::integer;
 IF rev IS NULL OR rev<>d.revision THEN RAISE EXCEPTION 'Розділ уже змінено. Онови огляд.' USING ERRCODE='40001'; END IF;
 SELECT value,(ordinality-1)::integer INTO r,idx FROM jsonb_array_elements(d.payload) WITH ORDINALITY WHERE value->>'id'=body->>'id';
 IF r IS NULL THEN RAISE EXCEPTION 'Проєкт не знайдено'; END IF;
 IF body->>'op'='hill' THEN
  IF body->>'position' IS NULL OR body->>'position' !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'Перевір позицію'; END IF;
  pos:=(body->>'position')::integer;
  IF pos<0 OR pos>100 THEN RAISE EXCEPTION 'Позиція має бути від 0 до 100'; END IF;
  IF length(trim(coalesce(body->>'note','')))=0 OR length(body->>'note')>4000 THEN RAISE EXCEPTION 'Поясни зміну позиції'; END IF;
  IF jsonb_array_length(coalesce(r->'hillHistory','[]'))>=1000 THEN RAISE EXCEPTION 'Історія заповнена'; END IF;
  entry:=jsonb_build_object('id',gen_random_uuid(),'position',pos,'note',trim(body->>'note'),'author',a->>'name','at',now());
  r:=r||jsonb_build_object('hill',entry,'hillHistory',coalesce(r->'hillHistory','[]')||jsonb_build_array(entry));
 ELSIF body->>'op'='weekly' THEN
  IF body->>'health' IS NULL OR body->>'health' NOT IN ('on_track','at_risk','blocked','complete') THEN RAISE EXCEPTION 'Перевір стан проєкту'; END IF;
  IF length(trim(coalesce(body->>'summary','')))=0 OR length(trim(coalesce(body->>'next','')))=0 THEN RAISE EXCEPTION 'Заповни результат і наступний крок'; END IF;
  IF body->>'health' IN ('at_risk','blocked') AND length(trim(coalesce(body->>'risk','')))=0 THEN RAISE EXCEPTION 'Опиши ризик або блокер'; END IF;
  IF length(coalesce(body->>'summary',''))>4000 OR length(coalesce(body->>'next',''))>4000 OR length(coalesce(body->>'risk',''))>4000 OR length(coalesce(body->>'decision',''))>4000 THEN RAISE EXCEPTION 'Скороти оновлення до 4000 символів у полі'; END IF;
  IF jsonb_array_length(coalesce(r->'weeklyUpdates','[]'))>=500 THEN RAISE EXCEPTION 'Історія заповнена'; END IF;
  SELECT count(*)+1 INTO n FROM jsonb_array_elements(coalesce(r->'weeklyUpdates','[]')) WHERE value->>'week'=week;
  entry:=jsonb_build_object('id',gen_random_uuid(),'week',week,'revision',n,'health',body->>'health','summary',trim(body->>'summary'),'next',trim(body->>'next'),'risk',trim(coalesce(body->>'risk','')),'decision',trim(coalesce(body->>'decision','')),'author',a->>'name','at',now(),'hill',r->'hill');
  r:=r||jsonb_build_object('weeklyUpdates',coalesce(r->'weeklyUpdates','[]')||jsonb_build_array(entry));
 ELSE RAISE EXCEPTION 'Невідома дія'; END IF;
 p:=jsonb_set(d.payload,ARRAY[idx::text],r);
 RETURN cmo.owner_data(jsonb_build_object('op','save','key',k,'revision',rev,'payload',p))||jsonb_build_object('entry',entry);
END $$;
REVOKE ALL ON FUNCTION cmo.project_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.project_action(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION api.cmo_project_action(body jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT cmo.project_action(body) $$;
REVOKE ALL ON FUNCTION api.cmo_project_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.cmo_project_action(jsonb) TO authenticated;
