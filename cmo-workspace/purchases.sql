-- Закупівля реклами: запит → погодження керівника → факт оплати → приймання.
-- Дані закупівлі живуть у задачі (runtime_payload.purchase), щоб працювали Inbox, коментарі, файли й історія.
CREATE OR REPLACE FUNCTION cmo.purchase_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE a jsonb := cmo.actor(); op text := body->>'op'; t cmo.tasks; p jsonb; pu jsonb; perms jsonb; dest text; new_id text; amount numeric; event jsonb; ck jsonb;
 now_text text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 channels text[] := ARRAY['Чати ЖК','Google Ads','Meta Ads','Зовнішня реклама','Поліграфія','Пабліки / блогери','Промо / BTL','Інше'];
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Немає дозволу на цей Workspace' USING ERRCODE='42501'; END IF;

 IF op='create' THEN
  IF NOT (body->>'channel' = ANY(channels)) THEN RAISE EXCEPTION 'Обери канал закупівлі'; END IF;
  IF length(trim(COALESCE(body->>'placement',''))) NOT BETWEEN 2 AND 300 THEN RAISE EXCEPTION 'Вкажи, де саме розміщуємо (до 300 символів)'; END IF;
  amount := NULLIF(body->>'amount','')::numeric;
  IF amount IS NULL OR amount<=0 OR amount>10000000 THEN RAISE EXCEPTION 'Вкажи суму, грн'; END IF;
  IF COALESCE(body->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Вкажи місяць оплати'; END IF;
  IF length(COALESCE(body->>'goal',''))>3000 OR length(COALESCE(body->>'link',''))>1000 THEN RAISE EXCEPTION 'Задовгий опис'; END IF;
  dest := COALESCE(NULLIF(trim(COALESCE(body->>'assignee','')),''),a->>'name');
  IF a->>'role'='executor' AND dest<>a->>'name' THEN RAISE EXCEPTION 'Запит на закупівлю виконавець створює на себе' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM cmo.members WHERE name=dest AND active) THEN RAISE EXCEPTION 'Виконавець не має активного доступу'; END IF;
  new_id := 'task-'||gen_random_uuid()::text;
  pu := jsonb_build_object('channel',body->>'channel','placement',trim(body->>'placement'),'amount',amount,'month',body->>'month','goal',trim(COALESCE(body->>'goal','')),'link',trim(COALESCE(body->>'link','')),
        'status','requested','requestedBy',a->>'name','requestedAt',now_text);
  p := jsonb_build_object('id',new_id,'title',left('Закупівля: '||trim(body->>'placement')||' · '||trim(to_char(amount,'FM999 999 990'))||' грн',500),
        'description',concat_ws(E'\n\n','Канал: '||(body->>'channel')||' · місяць '||(body->>'month'),'Навіщо: '||NULLIF(trim(COALESCE(body->>'goal','')),''),'Рахунок / посилання: '||NULLIF(trim(COALESCE(body->>'link','')),'')),
        'assignee',dest,'priority',CASE WHEN amount>=10000 THEN 'High' ELSE 'Medium' END,'label','Ads','lane','todo','due',COALESCE(NULLIF(body->>'due',''),'без дедлайну'),'purchase',pu,
        'checklist',(SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'text',x,'done',false)) FROM unnest(ARRAY['Погоджено керівником','Оплачено / розміщено','Додано посилання або скрін розміщення','Внесено фактичну суму']) x),
        'comments','[]'::jsonb,'participantIds',jsonb_build_array(a->>'id'),
        'activity',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',a->>'name','action','Запит на закупівлю','note',trim(to_char(amount,'FM999 999 990'))||' грн · '||(body->>'channel'))),
        'createdAt',now_text,'updatedAt',now_text,'createdBy',a->>'id');
  INSERT INTO cmo.tasks(workspace_key,source,source_id,title,description,assignee_name,priority,lane,label,due_text,source_created_at,source_updated_at,original_payload,runtime_payload)
  VALUES('pavutyna-cmo','workspace',new_id,p->>'title',p->>'description',dest,p->>'priority','todo','Ads',p->>'due',now(),now(),p,p);
  RETURN jsonb_build_object('id',new_id,'version',1);
 END IF;

 SELECT * INTO t FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND source_id=body->>'id' FOR UPDATE;
 IF NOT FOUND OR t.runtime_payload->'purchase' IS NULL THEN RAISE EXCEPTION 'Закупівлю не знайдено' USING ERRCODE='42501'; END IF;
 perms := cmo.task_permissions(a,t.runtime_payload);
 IF NOT (perms->>'visible')::boolean THEN RAISE EXCEPTION 'Закупівля недоступна' USING ERRCODE='42501'; END IF;
 IF COALESCE(body->>'version','')<>t.version::text THEN RAISE EXCEPTION 'Картка вже змінилася. Онови й повтори.' USING ERRCODE='40001'; END IF;
 p := t.runtime_payload; pu := p->'purchase'; ck := COALESCE(p->'checklist','[]'::jsonb);

 IF op='decide' THEN
  IF a->>'role'<>'owner' THEN RAISE EXCEPTION 'Погоджує бюджет керівник' USING ERRCODE='42501'; END IF;
  IF pu->>'status' NOT IN ('requested','rejected','approved') THEN RAISE EXCEPTION 'Закупівлю вже оплачено'; END IF;
  IF body->>'decision' NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Невідоме рішення'; END IF;
  IF body->>'decision'='reject' AND length(trim(COALESCE(body->>'note','')))=0 THEN RAISE EXCEPTION 'Поясни причину відмови'; END IF;
  amount := COALESCE(NULLIF(body->>'amount','')::numeric,(pu->>'amount')::numeric);
  IF amount<=0 THEN RAISE EXCEPTION 'Перевір суму'; END IF;
  pu := pu || jsonb_build_object('status',CASE WHEN body->>'decision'='approve' THEN 'approved' ELSE 'rejected' END,'approvedAmount',CASE WHEN body->>'decision'='approve' THEN to_jsonb(amount) ELSE 'null'::jsonb END,
        'decidedBy',a->>'name','decidedAt',now_text,'decisionNote',trim(COALESCE(body->>'note','')));
  IF jsonb_array_length(ck)>0 THEN ck := jsonb_set(ck,'{0,done}',to_jsonb(body->>'decision'='approve')); END IF;
  p := p || jsonb_build_object('purchase',pu,'checklist',ck);
  IF body->>'decision'='reject' THEN p := p || jsonb_build_object('lane','blocked','result','Відхилено: '||trim(body->>'note')); END IF;
  IF body->>'decision'='approve' AND p->>'lane' IN ('blocked','backlog') THEN p := p || jsonb_build_object('lane','todo'); END IF;
  event := jsonb_build_object('action',CASE WHEN body->>'decision'='approve' THEN 'Бюджет погоджено' ELSE 'Бюджет відхилено' END,'note',trim(to_char(amount,'FM999 999 990'))||' грн'||COALESCE(' · '||NULLIF(trim(COALESCE(body->>'note','')),''),''));
 ELSIF op='fact' THEN
  IF NOT (perms->>'work')::boolean AND a->>'role'<>'owner' THEN RAISE EXCEPTION 'Факт вносить відповідальний' USING ERRCODE='42501'; END IF;
  IF pu->>'status' NOT IN ('approved','paid') THEN RAISE EXCEPTION 'Спочатку потрібне погодження бюджету'; END IF;
  amount := NULLIF(body->>'actual','')::numeric;
  IF amount IS NULL OR amount<0 OR amount>10000000 THEN RAISE EXCEPTION 'Вкажи фактичну суму'; END IF;
  IF length(trim(COALESCE(body->>'proof',''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'Додай посилання на розміщення або опис доказу'; END IF;
  pu := pu || jsonb_build_object('status','paid','actual',amount,'proof',trim(body->>'proof'),'paidAt',now_text,'paidBy',a->>'name');
  SELECT jsonb_agg(CASE WHEN n>1 THEN x||jsonb_build_object('done',true) ELSE x END ORDER BY n) INTO ck FROM jsonb_array_elements(ck) WITH ORDINALITY e(x,n);
  p := p || jsonb_build_object('purchase',pu,'checklist',COALESCE(ck,'[]'::jsonb),'result','Оплачено '||trim(to_char(amount,'FM999 999 990'))||' грн. '||trim(body->>'proof'));
  IF p->>'lane' NOT IN ('ready','done') THEN p := p || jsonb_build_object('lane','review'); END IF;
  event := jsonb_build_object('action','Внесено факт оплати','note',trim(to_char(amount,'FM999 999 990'))||' грн');
 ELSE RAISE EXCEPTION 'Невідома дія'; END IF;

 p := p || jsonb_build_object('updatedAt',now_text,'activity',COALESCE(p->'activity','[]'::jsonb)||jsonb_build_array(event||jsonb_build_object('id',gen_random_uuid(),'at',now_text,'actor',a->>'name')));
 UPDATE cmo.tasks SET runtime_payload=p,lane=p->>'lane',source_updated_at=now(),version=version+1 WHERE workspace_key=t.workspace_key AND source=t.source AND source_id=t.source_id;
 RETURN jsonb_build_object('id',t.source_id,'version',t.version+1);
END $fn$;
REVOKE ALL ON FUNCTION cmo.purchase_action(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cmo.purchase_action(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION api.cmo_purchase_action(body jsonb) RETURNS jsonb LANGUAGE sql SET search_path TO '' AS $$ SELECT cmo.purchase_action(body) $$;
REVOKE ALL ON FUNCTION api.cmo_purchase_action(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.cmo_purchase_action(jsonb) TO authenticated;
