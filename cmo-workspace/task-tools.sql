CREATE OR REPLACE FUNCTION cmo.request(body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor jsonb:=cmo.actor(); op text:=body->>'op'; t cmo.tasks; p jsonb;
 now_text text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 new_id text; dest text; next_lane text; event jsonb; result_text text; permissions jsonb; attachment jsonb; idx integer; child cmo.tasks;
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
 ELSIF op IN ('checklist_add','checklist_edit','checklist_remove') THEN
  IF op<>'checklist_remove' AND (length(trim(COALESCE(body->>'text','')))=0 OR length(body->>'text')>2000) THEN RAISE EXCEPTION 'Перевір пункт чеклиста'; END IF;
  IF op='checklist_add' THEN
   IF jsonb_array_length(COALESCE(p->'checklist','[]'))>=100 THEN RAISE EXCEPTION 'Максимум 100 пунктів'; END IF;
   p:=jsonb_set(p,'{checklist}',COALESCE(p->'checklist','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'text',trim(body->>'text'),'done',false)));
  ELSE
   idx:=(body->>'index')::integer;
   IF idx IS NULL OR idx<0 OR idx>=jsonb_array_length(COALESCE(p->'checklist','[]')) THEN RAISE EXCEPTION 'Пункт не знайдено'; END IF;
   IF op='checklist_remove' THEN p:=jsonb_set(p,'{checklist}',(p->'checklist')-idx);
   ELSE p:=jsonb_set(p,ARRAY['checklist',idx::text,'text'],to_jsonb(trim(body->>'text'))); END IF;
  END IF;
  event:=jsonb_build_object('action','Змінено структуру чеклиста','note',op);
 ELSIF op='subtask_create' THEN
  IF length(trim(COALESCE(body->>'title','')))=0 OR length(body->>'title')>500 THEN RAISE EXCEPTION 'Перевір назву підзадачі'; END IF;
  IF jsonb_array_length(COALESCE(p->'childIds','[]'))>=50 THEN RAISE EXCEPTION 'Максимум 50 підзадач'; END IF;
  IF p->>'parentId' IS NOT NULL THEN RAISE EXCEPTION 'Підзадача вже має батьківську задачу'; END IF;
  dest:=COALESCE(NULLIF(body->>'assignee',''),t.assignee_name);
  IF actor->>'role'='executor' AND dest<>actor->>'name' THEN RAISE EXCEPTION 'Власні підзадачі можна призначити лише собі' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM cmo.members WHERE name=dest AND active) THEN RAISE EXCEPTION 'Виконавець не має активного доступу'; END IF;
  new_id:='task-'||gen_random_uuid()::text;
  attachment:=jsonb_build_object('id',new_id,'title',trim(body->>'title'),'description',COALESCE(body->>'description',''),'assignee',dest,'priority',t.priority,'label',t.label,'lane','todo','due',COALESCE(NULLIF(body->>'due',''),p->>'due'),'parentId',t.source_id,'checklist','[]'::jsonb,'comments','[]'::jsonb,'activity',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',actor->>'name','action','Створено підзадачу','note',t.source_id)),'createdAt',now_text,'updatedAt',now_text,'createdBy',actor->>'id');
  INSERT INTO cmo.tasks(workspace_key,source,source_id,title,description,assignee_name,priority,lane,label,due_text,source_created_at,source_updated_at,original_payload,runtime_payload)
  VALUES('pavutyna-cmo','workspace',new_id,attachment->>'title',attachment->>'description',dest,t.priority,'todo',t.label,attachment->>'due',now(),now(),attachment,attachment);
  p:=p||jsonb_build_object('childIds',COALESCE(p->'childIds','[]')||jsonb_build_array(new_id));
  event:=jsonb_build_object('action','Створено підзадачу','note',new_id||': '||(body->>'title'));
 ELSIF op='task_link' THEN
  IF body->>'targetId'=t.source_id OR body->>'relation' IS NULL OR body->>'relation' NOT IN ('related','blocks','duplicate') THEN RAISE EXCEPTION 'Перевір зв’язок'; END IF;
  SELECT * INTO child FROM cmo.tasks WHERE source_id=body->>'targetId' AND workspace_key='pavutyna-cmo';
  IF NOT FOUND OR NOT (cmo.task_permissions(actor,child.runtime_payload)->>'visible')::boolean THEN RAISE EXCEPTION 'Пов’язана задача недоступна' USING ERRCODE='42501'; END IF;
  IF jsonb_array_length(COALESCE(p->'links','[]'))>=100 THEN RAISE EXCEPTION 'Максимум 100 зв’язків'; END IF;
  p:=p||jsonb_build_object('links',COALESCE(p->'links','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'targetId',child.source_id,'relation',body->>'relation')));
  event:=jsonb_build_object('action','Додано зв’язок задач','note',body->>'relation');
 ELSIF op='task_unlink' THEN
  p:=p||jsonb_build_object('links',COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(p->'links','[]')) x WHERE x->>'id' IS DISTINCT FROM body->>'linkId'),'[]'));
  event:=jsonb_build_object('action','Прибрано зв’язок задач','note','');
 ELSIF op='attachment_prepare' THEN
  IF length(COALESCE(body->>'name','')) NOT BETWEEN 1 AND 255 OR body->>'size' IS NULL OR body->>'mime' IS NULL OR (body->>'size')::bigint NOT BETWEEN 1 AND 20971520 OR body->>'mime' NOT IN ('image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/json','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','video/mp4','audio/mpeg','audio/wav') THEN RAISE EXCEPTION 'Файл має бути підтримуваного формату, до 20 МБ'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(COALESCE(p->'attachments','[]')) x WHERE x->>'status'<>'removed')>=30 THEN RAISE EXCEPTION 'Максимум 30 файлів у задачі'; END IF;
  new_id:=gen_random_uuid()::text;
  attachment:=jsonb_build_object('id',new_id,'path',t.source_id||'/'||new_id,'name',body->>'name','size',(body->>'size')::bigint,'mime',body->>'mime','status','pending','uploadedBy',actor->>'id','createdAt',now_text);
  p:=p||jsonb_build_object('attachments',COALESCE(p->'attachments','[]')||jsonb_build_array(attachment));
  event:=jsonb_build_object('action','Підготовлено вкладення','note',body->>'name');
 ELSIF op IN ('attachment_confirm','attachment_remove','attachment_restore') THEN
  SELECT x INTO attachment FROM jsonb_array_elements(COALESCE(p->'attachments','[]')) x WHERE x->>'id'=body->>'attachmentId' AND (x->>'status'<>'removed' OR op='attachment_restore');
  IF attachment IS NULL THEN RAISE EXCEPTION 'Вкладення не знайдено'; END IF;
  IF op='attachment_restore' AND actor->>'role'<>'owner' THEN RAISE EXCEPTION 'Відновлення доступне керівнику' USING ERRCODE='42501'; END IF;
  IF op IN ('attachment_confirm','attachment_restore') THEN
   IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='cmo-task-files' AND name=attachment->>'path' AND (metadata->>'size')::bigint=(attachment->>'size')::bigint) THEN RAISE EXCEPTION 'Файл ще не завантажено або розмір не збігається'; END IF;
  END IF;
  p:=jsonb_set(p,'{attachments}',(SELECT jsonb_agg(CASE WHEN x->>'id'=attachment->>'id' THEN x||jsonb_build_object('status',CASE WHEN op='attachment_remove' THEN 'removed' ELSE 'ready' END) ELSE x END) FROM jsonb_array_elements(p->'attachments') x));
  event:=jsonb_build_object('action',CASE WHEN op='attachment_confirm' THEN 'Додано файл' WHEN op='attachment_restore' THEN 'Відновлено вкладення' ELSE 'Прибрано вкладення' END,'note',attachment->>'name');

 ELSIF op='move' THEN
   next_lane:=body->>'lane';
   IF next_lane IS NULL OR next_lane NOT IN ('backlog','todo','progress','blocked','review','ready','done') THEN RAISE EXCEPTION 'Невідомий статус'; END IF;
   IF actor->>'role'<>'owner' AND next_lane NOT IN ('todo','progress','blocked','review') THEN RAISE EXCEPTION 'Приймання результату доступне керівнику' USING ERRCODE='42501'; END IF;
   result_text:=trim(COALESCE(body->>'result',''));
   IF next_lane IN ('review','blocked') AND result_text='' THEN RAISE EXCEPTION 'Додай результат або причину блокування'; END IF;
   IF next_lane='done' AND t.lane<>'review' THEN RAISE EXCEPTION 'Спочатку передай результат на перевірку'; END IF;
   IF next_lane IN ('review','done') AND EXISTS(SELECT 1 FROM cmo.tasks ch WHERE ch.source_id IN (SELECT jsonb_array_elements_text(COALESCE(p->'childIds','[]'))) AND ch.lane<>'done') THEN RAISE EXCEPTION 'Спочатку заверши й прийми підзадачі'; END IF;
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
 RETURN jsonb_build_object('id',t.source_id,'version',t.version+1,'attachment',CASE WHEN op='attachment_prepare' THEN attachment ELSE NULL END,'childId',CASE WHEN op='subtask_create' THEN new_id ELSE NULL END);
END $function$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('cmo-task-files','cmo-task-files',false,20971520,ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/json','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','video/mp4','audio/mpeg','audio/wav']) ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION cmo.file_access(object_name text,operation text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=cmo.actor();t cmo.tasks;f jsonb; rights jsonb;
BEGIN
 IF a IS NULL OR operation NOT IN ('read','upload') THEN RETURN false; END IF;
 SELECT * INTO t FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND source_id=split_part(object_name,'/',1);
 IF NOT FOUND THEN RETURN false; END IF;
 rights:=cmo.task_permissions(a,t.runtime_payload);
 SELECT x INTO f FROM jsonb_array_elements(COALESCE(t.runtime_payload->'attachments','[]')) x WHERE x->>'path'=object_name;
 IF f IS NULL OR f->>'status'='removed' THEN RETURN false; END IF;
 IF operation='read' THEN RETURN (rights->>'visible')::boolean AND (f->>'status'='ready' OR a->>'role'='owner' OR f->>'uploadedBy'=a->>'id'); END IF;
 RETURN (rights->>'work')::boolean AND f->>'status'='pending' AND f->>'uploadedBy'=a->>'id';
END $$;
REVOKE ALL ON FUNCTION cmo.file_access(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.file_access(text,text) TO authenticated;
CREATE POLICY cmo_task_file_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='cmo-task-files' AND cmo.file_access(name,'upload'));
CREATE POLICY cmo_task_file_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='cmo-task-files' AND cmo.file_access(name,'read'));
NOTIFY pgrst,'reload schema';
