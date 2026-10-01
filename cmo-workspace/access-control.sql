-- Per-task permissions. Membership is resolved server-side by cmo.actor().
CREATE OR REPLACE FUNCTION cmo.task_permissions(a jsonb,p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 WITH rights AS (
 SELECT COALESCE(a->>'role'='owner',false) AS owner,
 COALESCE(a->>'role' IN ('owner','intake','executor') AND p->>'assignee'=a->>'name',false) AS assigned,
 COALESCE(a->>'role'='intake' AND p->>'createdBy'=a->>'id',false) AS creator,
 COALESCE(a->>'role' IN ('intake','executor') AND COALESCE(p->'participantIds','[]'::jsonb) ? (a->>'id'),false) AS participant,
 COALESCE(p->>'lane' IN ('review','ready','done'),false) AS locked
 ) SELECT jsonb_build_object(
 'visible',owner OR assigned OR creator OR participant,
 'work',owner OR (assigned AND NOT locked),
 'comment',owner OR assigned OR creator OR participant,
 'edit',owner OR (assigned AND a->>'role'='intake' AND NOT locked),
 'approve',owner,
 'handoff',owner OR (assigned AND NOT locked)
 ) FROM rights
$$;
REVOKE ALL ON FUNCTION cmo.task_permissions(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION cmo.request(body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor jsonb:=cmo.actor(); op text:=body->>'op'; t cmo.tasks; p jsonb;
 now_text text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 new_id text; dest text; next_lane text; event jsonb; result_text text; permissions jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Немає дозволу на цей Workspace' USING ERRCODE='42501'; END IF;
 IF op='list' THEN
   RETURN jsonb_build_object('actor',actor,'tasks',COALESCE((SELECT jsonb_agg(runtime_payload || jsonb_build_object('version',version,'source',source,'permissions',cmo.task_permissions(actor,runtime_payload)) ORDER BY source_updated_at DESC) FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND (cmo.task_permissions(actor,runtime_payload)->>'visible')::boolean),'[]'::jsonb),
     'team',CASE WHEN actor->>'role'='owner' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('name',name,'role',role,'active',active) ORDER BY name) FROM cmo.members WHERE active),'[]'::jsonb) ELSE '[]'::jsonb END,
     'assignees',(SELECT jsonb_agg(name ORDER BY name) FROM (SELECT name FROM cmo.members WHERE active UNION SELECT assignee_name FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND actor->>'role'='owner') names));
 END IF;
 IF op='create' THEN
   IF actor->>'role' NOT IN ('owner','intake') THEN RAISE EXCEPTION 'Створення задач недоступне' USING ERRCODE='42501'; END IF;
   IF length(trim(COALESCE(body->>'title','')))=0 OR length(body->>'title')>500 OR length(COALESCE(body->>'description',''))>20000 THEN RAISE EXCEPTION 'Перевір назву й опис'; END IF;
   dest:=COALESCE(NULLIF(body->>'assignee',''),actor->>'name');
   IF NOT EXISTS(SELECT 1 FROM cmo.members WHERE name=dest AND active UNION SELECT 1 FROM cmo.tasks WHERE assignee_name=dest AND actor->>'role'='owner') THEN RAISE EXCEPTION 'Виконавець не має активного доступу'; END IF;
   IF COALESCE(body->>'priority','Medium') NOT IN ('High','Medium','Low') THEN RAISE EXCEPTION 'Невідомий пріоритет'; END IF;
   new_id:='task-'||gen_random_uuid()::text;
   p:=jsonb_build_object('id',new_id,'title',trim(body->>'title'),'description',COALESCE(body->>'description',''),'assignee',dest,'priority',COALESCE(body->>'priority','Medium'),'label',COALESCE(body->>'label','Operations'),'lane','todo','due',COALESCE(NULLIF(body->>'due',''),'без дедлайну'),'checklist','[]'::jsonb,'comments','[]'::jsonb,'activity',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',actor->>'name','action','Створено задачу','note','')),'createdAt',now_text,'updatedAt',now_text,'createdBy',actor->>'id');
   INSERT INTO cmo.tasks(workspace_key,source,source_id,title,description,assignee_name,priority,lane,label,due_text,source_created_at,source_updated_at,original_payload,runtime_payload)
   VALUES ('pavutyna-cmo','workspace',new_id,p->>'title',p->>'description',dest,p->>'priority','todo',p->>'label',p->>'due',now(),now(),p,p);
   RETURN jsonb_build_object('id',new_id,'version',1);
 END IF;
 SELECT * INTO t FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND source_id=body->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Задача недоступна' USING ERRCODE='42501'; END IF;
 permissions:=cmo.task_permissions(actor,t.runtime_payload);
 IF NOT (permissions->>'visible')::boolean THEN RAISE EXCEPTION 'Задача недоступна' USING ERRCODE='42501'; END IF;
 IF op='comment' THEN
  IF NOT (permissions->>'comment')::boolean THEN RAISE EXCEPTION 'Коментування недоступне' USING ERRCODE='42501'; END IF;
 ELSIF op='edit' THEN
  IF NOT (permissions->>'edit')::boolean THEN RAISE EXCEPTION 'Редагування умов недоступне' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT (permissions->>'work')::boolean THEN RAISE EXCEPTION 'Змінювати можна власну задачу до передачі на рев’ю. Повернення з рев’ю — за керівником.' USING ERRCODE='42501'; END IF;
 END IF;
 IF COALESCE(body->>'version','')<>t.version::text THEN RAISE EXCEPTION 'Картка вже змінилася. Онови задачник і повтори дію.' USING ERRCODE='40001'; END IF;
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
   IF NOT EXISTS(SELECT 1 FROM cmo.members WHERE name=dest AND active UNION SELECT 1 FROM cmo.tasks WHERE assignee_name=dest AND actor->>'role'='owner') THEN RAISE EXCEPTION 'Виконавець не має активного доступу'; END IF;
   IF trim(COALESCE(body->>'text',''))='' THEN RAISE EXCEPTION 'Додай пояснення передачі'; END IF;
   IF t.lane='done' THEN RAISE EXCEPTION 'Спочатку відкрий завершену задачу'; END IF;
   p:=p||jsonb_build_object('assignee',dest,'lane','todo','participantIds',CASE WHEN COALESCE(p->'participantIds','[]'::jsonb) ? (actor->>'id') THEN COALESCE(p->'participantIds','[]'::jsonb) ELSE COALESCE(p->'participantIds','[]'::jsonb)||jsonb_build_array(actor->>'id') END);
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
END $function$;

REVOKE ALL ON FUNCTION cmo.request(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.request(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
