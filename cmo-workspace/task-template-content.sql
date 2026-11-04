-- Шаблон задачі (тип + критерії готовності → чеклист) і «Контент → задача».
-- Інкрементальний патч до cmo.request: безпечно повторювати.
BEGIN;

DO $patch$
DECLARE d text := pg_get_functiondef('cmo.request(jsonb)'::regprocedure);
 a1 text := $a$IF COALESCE(body->>'priority','Medium') NOT IN ('High','Medium','Low') THEN RAISE EXCEPTION 'Невідомий пріоритет'; END IF;
   new_id:='task-'||gen_random_uuid()::text;$a$;
 b1 text := $b$IF COALESCE(body->>'priority','Medium') NOT IN ('High','Medium','Low') THEN RAISE EXCEPTION 'Невідомий пріоритет'; END IF;
   IF COALESCE(body->>'label','Operations') NOT IN ('SMM','Content','Design','Digital','Ads','Budget','BTL','OOH','Print','Promo','Brand','Analytics','Product','Partnership','Operations','Аудит чатів','QA') THEN RAISE EXCEPTION 'Невідомий тип задачі'; END IF;
   IF body ? 'checklist' AND (jsonb_typeof(body->'checklist')<>'array' OR jsonb_array_length(body->'checklist')>30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'checklist') x WHERE jsonb_typeof(x)<>'string' OR length(trim(x#>>'{}')) NOT BETWEEN 1 AND 2000)) THEN RAISE EXCEPTION 'Перевір критерії готовності: до 30 пунктів'; END IF;
   new_id:='task-'||gen_random_uuid()::text;$b$;
 a2 text := $a$'checklist','[]'::jsonb,'comments','[]'::jsonb,'activity',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',actor->>'name','action','Створено задачу'$a$;
 b2 text := $b$'checklist',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'text',trim(x#>>'{}'),'done',false)) FROM jsonb_array_elements(COALESCE(body->'checklist','[]'::jsonb)) x),'[]'::jsonb),'comments','[]'::jsonb,'activity',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',actor->>'name','action','Створено задачу'$b$;
BEGIN
 IF position(b1 in d)=0 THEN
  IF position(a1 in d)=0 THEN RAISE EXCEPTION 'cmo.request: блок валідації не знайдено'; END IF;
  d := replace(d, a1, b1);
 END IF;
 IF position(b2 in d)=0 THEN
  IF position(a2 in d)=0 THEN RAISE EXCEPTION 'cmo.request: блок чеклиста не знайдено'; END IF;
  d := replace(d, a2, b2);
 END IF;
 EXECUTE d;
END $patch$;

CREATE OR REPLACE FUNCTION cmo.content_task(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE a jsonb := cmo.actor(); d cmo.space_documents; item jsonb; idx integer; dest text; prio text; due text; descr text; p jsonb; new_id text; next_item jsonb;
 now_text text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
 IF a IS NULL OR a->>'role'<>'owner' THEN RAISE EXCEPTION 'Передавати контент у роботу може керівник' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM cmo.space_documents WHERE key='content' FOR UPDATE;
 IF NOT FOUND OR jsonb_typeof(d.payload)<>'array' THEN RAISE EXCEPTION 'Розділ «Контент» недоступний'; END IF;
 IF (body->>'revision')::integer IS DISTINCT FROM d.revision THEN RAISE EXCEPTION 'Розділ уже змінено. Онови дані й повтори.' USING ERRCODE='40001'; END IF;
 SELECT e, (n-1)::integer INTO item, idx FROM jsonb_array_elements(d.payload) WITH ORDINALITY t(e,n) WHERE e->>'id'=body->>'contentId';
 IF item IS NULL THEN RAISE EXCEPTION 'Матеріал не знайдено'; END IF;
 dest := NULLIF(trim(COALESCE(body->>'assignee','')),'');
 IF dest IS NULL OR NOT EXISTS(SELECT 1 FROM cmo.members WHERE name=dest AND active) THEN RAISE EXCEPTION 'Виконавець не має активного доступу'; END IF;
 prio := COALESCE(NULLIF(body->>'priority',''),'Medium');
 IF prio NOT IN ('High','Medium','Low') THEN RAISE EXCEPTION 'Невідомий пріоритет'; END IF;
 due := COALESCE(NULLIF(body->>'due',''),NULLIF(item->>'due',''),'без дедлайну');
 IF length(COALESCE(body->>'note',''))>5000 THEN RAISE EXCEPTION 'Коментар до 5000 символів'; END IF;
 descr := left(concat_ws(E'\n\n',
   'Матеріал із розділу «Контент»: '||COALESCE(item->>'title',''),
   'Навіщо: '||NULLIF(item->>'objective',''),
   'Канал: '||NULLIF(item->>'channel',''),
   'Формат: '||NULLIF(item->>'format',''),
   'Хук: '||NULLIF(item->>'hook',''),
   'CTA: '||NULLIF(item->>'cta',''),
   'Бриф: '||NULLIF(item->>'brief',''),
   'Чернетка тексту:'||E'\n'||NULLIF(item->>'copy',''),
   'Доказ / що перевірити: '||NULLIF(item->>'proof',''),
   'Критерій приймання: '||NULLIF(item->>'acceptance',''),
   'Залежність: '||NULLIF(item->>'dependency',''),
   'Від керівника: '||NULLIF(trim(COALESCE(body->>'note','')),'')),20000);
 new_id := 'task-'||gen_random_uuid()::text;
 p := jsonb_build_object('id',new_id,'title',left('Контент: '||COALESCE(item->>'title','без назви'),500),'description',descr,'assignee',dest,'priority',prio,'label','Content','lane','todo','due',due,'contentId',item->>'id',
   'checklist',(SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'text',x,'done',false)) FROM unnest(ARRAY['Текст звірено з чинними умовами тарифу/акції','Візуал готовий і прикріплений як креатив','Погоджено керівником','Опубліковано — посилання додано в результат']) x),
   'comments','[]'::jsonb,'activity',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',a->>'name','action','Створено з розділу «Контент»','note',item->>'id')),
   'createdAt',now_text,'updatedAt',now_text,'createdBy',a->>'id');
 INSERT INTO cmo.tasks(workspace_key,source,source_id,title,description,assignee_name,priority,lane,label,due_text,source_created_at,source_updated_at,original_payload,runtime_payload)
 VALUES('pavutyna-cmo','workspace',new_id,p->>'title',descr,dest,prio,'todo','Content',due,now(),now(),p,p);
 next_item := item || jsonb_build_object('status','У роботі','owner',dest,'taskIds',COALESCE(item->'taskIds','[]'::jsonb)||jsonb_build_array(new_id));
 UPDATE cmo.space_documents SET payload=jsonb_set(payload,ARRAY[idx::text],next_item),revision=revision+1,updated_at=now() WHERE key='content' RETURNING * INTO d;
 INSERT INTO cmo.space_document_events(document_key,actor_id,revision,payload) VALUES('content',(a->>'id')::uuid,d.revision,d.payload);
 RETURN jsonb_build_object('taskId',new_id,'revision',d.revision);
END $fn$;
REVOKE ALL ON FUNCTION cmo.content_task(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cmo.content_task(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION api.cmo_content_task(body jsonb) RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $$ SELECT cmo.content_task(body) $$;
REVOKE ALL ON FUNCTION api.cmo_content_task(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.cmo_content_task(jsonb) TO authenticated;

COMMIT;
