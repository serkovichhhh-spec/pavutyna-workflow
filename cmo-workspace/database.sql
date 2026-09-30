-- CMO runtime. No changes to existing TYAMA tables or exposed functions.
CREATE TABLE cmo.members (
 email text PRIMARY KEY CHECK (email=lower(email)),
 name text UNIQUE NOT NULL,
 role text NOT NULL CHECK (role IN ('owner','intake','executor')),
 active boolean NOT NULL DEFAULT true
);
ALTER TABLE cmo.members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cmo.members FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE cmo.tasks ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE cmo.tasks ADD COLUMN runtime_payload jsonb;
UPDATE cmo.tasks SET runtime_payload=original_payload;
ALTER TABLE cmo.tasks ALTER COLUMN runtime_payload SET NOT NULL;
ALTER TABLE cmo.tasks ALTER COLUMN snapshot_sha256 DROP NOT NULL;
ALTER TABLE cmo.tasks DROP CONSTRAINT tasks_source_check;
ALTER TABLE cmo.tasks ADD CONSTRAINT tasks_source_check CHECK (source IN ('workflow','workspace'));

CREATE FUNCTION cmo.actor() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',u.id,'name',m.name,'role',m.role)
 FROM auth.users u JOIN cmo.members m ON m.email=lower(u.email)
 WHERE u.id=(SELECT auth.uid()) AND u.email_confirmed_at IS NOT NULL AND m.active
$$;
REVOKE ALL ON FUNCTION cmo.actor() FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA cmo TO authenticated;
GRANT EXECUTE ON FUNCTION cmo.actor() TO authenticated;

CREATE FUNCTION cmo.request(body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor jsonb:=cmo.actor(); op text:=body->>'op'; t cmo.tasks; p jsonb;
 now_text text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 new_id text; dest text; next_lane text; event jsonb; result_text text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Немає дозволу на цей Workspace' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
   RETURN jsonb_build_object('actor',actor,'tasks',COALESCE((SELECT jsonb_agg(runtime_payload || jsonb_build_object('version',version,'source',source) ORDER BY source_updated_at DESC) FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND (actor->>'role'='owner' OR assignee_name=actor->>'name' OR (actor->>'role'='intake' AND runtime_payload->>'createdBy'=actor->>'id'))),'[]'::jsonb),
     'assignees',(SELECT jsonb_agg(name ORDER BY name) FROM (SELECT name FROM cmo.members WHERE active UNION SELECT assignee_name FROM cmo.tasks WHERE workspace_key='pavutyna-cmo') names));
 END IF;
 IF op='create' THEN
   IF actor->>'role' NOT IN ('owner','intake') THEN RAISE EXCEPTION 'Створення задач недоступне' USING ERRCODE='42501'; END IF;
   IF length(trim(COALESCE(body->>'title','')))=0 OR length(body->>'title')>500 OR length(COALESCE(body->>'description',''))>20000 THEN RAISE EXCEPTION 'Перевір назву й опис'; END IF;
   dest:=COALESCE(NULLIF(body->>'assignee',''),actor->>'name');
   IF NOT EXISTS(SELECT 1 FROM cmo.members WHERE name=dest AND active UNION SELECT 1 FROM cmo.tasks WHERE assignee_name=dest) THEN RAISE EXCEPTION 'Невідомий виконавець'; END IF;
   IF COALESCE(body->>'priority','Medium') NOT IN ('High','Medium','Low') THEN RAISE EXCEPTION 'Невідомий пріоритет'; END IF;
   new_id:='task-'||gen_random_uuid()::text;
   p:=jsonb_build_object('id',new_id,'title',trim(body->>'title'),'description',COALESCE(body->>'description',''),'assignee',dest,'priority',COALESCE(body->>'priority','Medium'),'label',COALESCE(body->>'label','Operations'),'lane','todo','due',COALESCE(NULLIF(body->>'due',''),'без дедлайну'),'checklist','[]'::jsonb,'comments','[]'::jsonb,'activity',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',actor->>'name','action','Створено задачу','note','')),'createdAt',now_text,'updatedAt',now_text,'createdBy',actor->>'id');
   INSERT INTO cmo.tasks(workspace_key,source,source_id,title,description,assignee_name,priority,lane,label,due_text,source_created_at,source_updated_at,original_payload,runtime_payload)
   VALUES ('pavutyna-cmo','workspace',new_id,p->>'title',p->>'description',dest,p->>'priority','todo',p->>'label',p->>'due',now(),now(),p,p);
   RETURN jsonb_build_object('id',new_id,'version',1);
 END IF;
 SELECT * INTO t FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND source_id=body->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Задачу не знайдено'; END IF;
 IF COALESCE(body->>'version','')<>t.version::text THEN RAISE EXCEPTION 'Картка вже змінилася. Онови задачник і повтори дію.' USING ERRCODE='40001'; END IF;
 IF actor->>'role'<>'owner' AND t.assignee_name<>actor->>'name' THEN RAISE EXCEPTION 'Можна змінювати лише свої задачі' USING ERRCODE='42501'; END IF;
 p:=t.runtime_payload;
 IF op='comment' THEN
   IF length(trim(COALESCE(body->>'text','')))=0 OR length(body->>'text')>10000 THEN RAISE EXCEPTION 'Перевір текст коментаря'; END IF;
   p:=jsonb_set(p,'{comments}',COALESCE(p->'comments','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'author',actor->>'name','text',body->>'text')));
   event:=jsonb_build_object('action','Додано коментар','note','');
 ELSIF op='check' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'checklist') WITH ORDINALITY c(item,n) WHERE n-1=(body->>'index')::integer) THEN RAISE EXCEPTION 'Пункт не знайдено'; END IF;
   IF jsonb_typeof(body->'done')<>'boolean' THEN RAISE EXCEPTION 'Некоректний стан'; END IF;
   p:=jsonb_set(p,ARRAY['checklist',body->>'index','done'],body->'done');
   event:=jsonb_build_object('action','Оновлено чеклист','note',body->>'index');
 ELSIF op='move' THEN
   next_lane:=body->>'lane';
   IF next_lane IS NULL OR next_lane NOT IN ('backlog','todo','progress','blocked','review','ready','done') THEN RAISE EXCEPTION 'Невідомий статус'; END IF;
   IF actor->>'role'<>'owner' AND next_lane NOT IN ('todo','progress','blocked','review') THEN RAISE EXCEPTION 'Приймання результату доступне керівнику' USING ERRCODE='42501'; END IF;
   result_text:=trim(COALESCE(body->>'result',''));
   IF next_lane IN ('review','blocked') AND result_text='' THEN RAISE EXCEPTION 'Додай результат або причину блокування'; END IF;
   IF next_lane='done' AND t.lane<>'review' THEN RAISE EXCEPTION 'Спочатку передай результат на перевірку'; END IF;
   p:=jsonb_set(p,'{lane}',to_jsonb(next_lane));
   IF result_text<>'' THEN p:=jsonb_set(p,'{result}',to_jsonb(result_text)); END IF;
   event:=jsonb_build_object('action','Змінено статус','note',t.lane||' → '||next_lane||CASE WHEN result_text<>'' THEN ': '||result_text ELSE '' END);
 ELSIF op='handoff' THEN
   dest:=body->>'assignee';
   IF NOT EXISTS(SELECT 1 FROM cmo.members WHERE name=dest AND active UNION SELECT 1 FROM cmo.tasks WHERE assignee_name=dest) THEN RAISE EXCEPTION 'Невідомий виконавець'; END IF;
   IF trim(COALESCE(body->>'text',''))='' THEN RAISE EXCEPTION 'Додай пояснення передачі'; END IF;
   IF t.lane='done' THEN RAISE EXCEPTION 'Спочатку відкрий завершену задачу'; END IF;
   p:=p||jsonb_build_object('assignee',dest,'lane','todo');
   event:=jsonb_build_object('action','Передано задачу','note',t.assignee_name||' → '||dest||': '||(body->>'text'));
 ELSIF op='edit' THEN
   IF actor->>'role' NOT IN ('owner','intake') THEN RAISE EXCEPTION 'Редагування умов недоступне' USING ERRCODE='42501'; END IF;
   IF length(trim(COALESCE(body->>'title','')))=0 OR length(body->>'title')>500 OR length(COALESCE(body->>'description',''))>20000 OR body->>'priority' NOT IN ('High','Medium','Low') THEN RAISE EXCEPTION 'Перевір поля задачі'; END IF;
   p:=p||jsonb_build_object('title',trim(body->>'title'),'description',COALESCE(body->>'description',''),'priority',body->>'priority','due',COALESCE(NULLIF(body->>'due',''),'без дедлайну'));
   event:=jsonb_build_object('action','Оновлено умови задачі','note','');
 ELSE RAISE EXCEPTION 'Невідома дія'; END IF;
 p:=p||jsonb_build_object('updatedAt',now_text,'activity',COALESCE(p->'activity','[]'::jsonb)||jsonb_build_array(event||jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',actor->>'name')));
 UPDATE cmo.tasks SET runtime_payload=p,title=p->>'title',description=p->>'description',assignee_name=p->>'assignee',priority=p->>'priority',lane=p->>'lane',due_text=p->>'due',source_updated_at=now(),version=version+1 WHERE workspace_key=t.workspace_key AND source=t.source AND source_id=t.source_id;
 RETURN jsonb_build_object('id',t.source_id,'version',t.version+1);
END $$;
REVOKE ALL ON FUNCTION cmo.request(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.request(jsonb) TO authenticated;
CREATE FUNCTION api.cmo_workspace(body jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT cmo.request(body) $$;
REVOKE ALL ON FUNCTION api.cmo_workspace(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.cmo_workspace(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
