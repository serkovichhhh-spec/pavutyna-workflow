-- Narrow, authenticated interface to explicitly shared visual boards.
-- Existing owner documents and task approval rules are not broadened.
CREATE OR REPLACE FUNCTION cmo.board_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=cmo.actor(); d cmo.space_documents; boards jsonb; b jsonb; card jsonb;
 op text:=body->>'op'; bid text:=body->>'boardId'; idx integer; next jsonb; c jsonb;
 session jsonb; ballots jsonb; mine jsonb; result jsonb; tid text; count_votes integer;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Немає доступу до Workspace' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM cmo.space_documents WHERE key='visual' FOR UPDATE;
 IF NOT FOUND THEN
  IF op='list' THEN RETURN jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('key','visual','revision',0,'payload',jsonb_build_object('boards','[]'::jsonb)))); END IF;
  RAISE EXCEPTION 'Спочатку створи візуальну дошку';
 END IF;
 boards:=CASE WHEN jsonb_typeof(d.payload)='array' THEN d.payload ELSE coalesce(d.payload->'boards','[]') END;
 IF op='list' THEN
  next:='[]';
  FOR b IN SELECT value FROM jsonb_array_elements(boards) LOOP
   IF a->>'role'='owner' OR coalesce(b->'members','[]') ? (a->>'name') THEN
    -- Unavailable task cards must not disclose copied task title/body/URLs.
    result:='[]';
    FOR c IN SELECT value FROM jsonb_array_elements(coalesce(b->'cards','[]')) LOOP
     IF c->>'kind'='task' AND NOT EXISTS(SELECT 1 FROM cmo.tasks t WHERE t.workspace_key='pavutyna-cmo' AND t.source_id=c->>'taskId' AND (cmo.task_permissions(a,t.runtime_payload)->>'visible')::boolean) THEN
      c:=c - ARRAY['title','body','url','tag'] || jsonb_build_object('title','Задача недоступна','body','');
     END IF;
     result:=result||jsonb_build_array(c);
    END LOOP;
    session:=coalesce(b->'session','{}');ballots:=coalesce(session->'ballots','{}');mine:=coalesce(ballots->(a->>'id'),'{}');
    session:=session-'ballots'||jsonb_build_object('myVotes',mine,'totals',coalesce((SELECT jsonb_object_agg(k,n) FROM (SELECT x.key k,sum(x.value::text::integer) n FROM jsonb_each(ballots) v CROSS JOIN LATERAL jsonb_each(v.value) x GROUP BY x.key) t),'{}'));
    next:=next||jsonb_build_array(b-'convertedCards'||jsonb_build_object('cards',result,'session',session));
   END IF;
  END LOOP;
  RETURN jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('key','visual','revision',d.revision,'payload',jsonb_build_object('boards',next,'active',d.payload->>'active'))));
 END IF;
 SELECT ordinality::integer-1,value INTO idx,b FROM jsonb_array_elements(boards) WITH ORDINALITY WHERE value->>'id'=bid;
 IF b IS NULL OR NOT (a->>'role'='owner' OR coalesce(b->'members','[]') ? (a->>'name')) THEN RAISE EXCEPTION 'Дошка недоступна' USING ERRCODE='42501'; END IF;
 IF op NOT IN ('vote','convert') AND coalesce(body->>'revision','')<>d.revision::text THEN RAISE EXCEPTION 'Дошку вже змінено. Онови її та повтори дію.' USING ERRCODE='40001'; END IF;
 IF op='save' THEN
  next:=body->'board';
  IF jsonb_typeof(next->'cards') IS DISTINCT FROM 'array' OR jsonb_typeof(coalesce(next->'edges','[]'))<>'array' OR jsonb_array_length(next->'cards')>500 THEN RAISE EXCEPTION 'Перевір картки дошки'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(next->'cards') row_card WHERE length(coalesce(row_card->>'id',''))=0 OR row_card->>'kind' NOT IN ('note','text','shape','frame','link','image','task')) OR (SELECT count(*) FROM jsonb_array_elements(next->'cards'))<>(SELECT count(DISTINCT row_card->>'id') FROM jsonb_array_elements(next->'cards') row_card) THEN RAISE EXCEPTION 'Некоректні або повторені картки'; END IF;
  result:='[]';
  FOR c IN SELECT value FROM jsonb_array_elements(next->'cards') LOOP
   IF c->>'kind'='task' THEN
    SELECT value INTO card FROM jsonb_array_elements(b->'cards') WHERE value->>'id'=c->>'id' AND value->>'taskId'=c->>'taskId';
    IF card IS NOT NULL AND a->>'role'<>'owner' THEN c:=card||jsonb_build_object('x',c->'x','y',c->'y','width',c->'width','height',c->'height');
    ELSIF NOT EXISTS(SELECT 1 FROM cmo.tasks t WHERE t.workspace_key='pavutyna-cmo' AND t.source_id=c->>'taskId' AND (cmo.task_permissions(a,t.runtime_payload)->>'visible')::boolean) THEN RAISE EXCEPTION 'Задача недоступна' USING ERRCODE='42501'; END IF;
   END IF;
   result:=result||jsonb_build_array(c);
  END LOOP;
  b:=b||jsonb_build_object('cards',result,'edges',coalesce(next->'edges','[]'),'zoom',next->'zoom','template',next->'template');
 ELSIF op='share' THEN
  IF a->>'role'<>'owner' THEN RAISE EXCEPTION 'Лише керівник відкриває доступ' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(body->'members') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'members') n WHERE NOT EXISTS(SELECT 1 FROM cmo.members m WHERE m.name=n AND m.active)) THEN RAISE EXCEPTION 'Обери активних учасників'; END IF;
  b:=b||jsonb_build_object('members',body->'members');
 ELSIF op='start' THEN
  IF a->>'role'<>'owner' THEN RAISE EXCEPTION 'Сесію запускає керівник' USING ERRCODE='42501'; END IF;
  IF coalesce((body->>'minutes')::integer,0) NOT BETWEEN 1 AND 60 OR coalesce((body->>'votes')::integer,0) NOT BETWEEN 1 AND 10 OR coalesce(body->>'phase','') NOT IN ('ideas','voting') THEN RAISE EXCEPTION 'Перевір параметри сесії'; END IF;
  b:=b||jsonb_build_object('session',jsonb_build_object('id',gen_random_uuid(),'phase',body->>'phase','endsAt',now()+make_interval(mins=>(body->>'minutes')::integer),'limit',(body->>'votes')::integer,'ballots','{}'::jsonb));
 ELSIF op='finish' THEN
  IF a->>'role'<>'owner' THEN RAISE EXCEPTION 'Сесію завершує керівник' USING ERRCODE='42501'; END IF;
  b:=jsonb_set(b,'{session,phase}','"finished"');
 ELSIF op='vote' THEN
  session:=b->'session';
  IF session->>'phase' IS DISTINCT FROM 'voting' OR coalesce((session->>'endsAt')::timestamptz,now())<=now() OR session->>'id' IS DISTINCT FROM body->>'sessionId' THEN RAISE EXCEPTION 'Голосування завершено або змінено'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'cards') row_card WHERE row_card->>'id'=body->>'cardId' AND row_card->>'kind' IN ('note','shape','text')) THEN RAISE EXCEPTION 'Обери ідею для голосування'; END IF;
  ballots:=coalesce(session->'ballots','{}');mine:=coalesce(ballots->(a->>'id'),'{}');
  IF coalesce((mine->> (body->>'cardId'))::integer,0)>0 THEN mine:=mine-(body->>'cardId');
  ELSE
   SELECT coalesce(sum(value::text::integer),0) INTO count_votes FROM jsonb_each(mine);
   IF count_votes>=(session->>'limit')::integer THEN RAISE EXCEPTION 'Ліміт голосів вичерпано. Забери голос з іншої ідеї.'; END IF;
   mine:=mine||jsonb_build_object(body->>'cardId',1);
  END IF;
  ballots:=jsonb_set(ballots,ARRAY[a->>'id'],mine);b:=jsonb_set(b,'{session,ballots}',ballots);
 ELSIF op='convert' THEN
  IF a->>'role' NOT IN ('owner','intake') THEN RAISE EXCEPTION 'Створення задач недоступне' USING ERRCODE='42501'; END IF;
  SELECT value INTO card FROM jsonb_array_elements(b->'cards') WHERE value->>'id'=body->>'cardId';
  IF card IS NULL THEN RAISE EXCEPTION 'Ідею видалено'; END IF;
  tid:=coalesce(b->'convertedCards'->>(body->>'cardId'),card->>'taskId');
  IF tid IS NULL THEN
   IF card->>'kind' NOT IN ('note','text','shape') THEN RAISE EXCEPTION 'Обери ідею'; END IF;
   result:=cmo.request(body||jsonb_build_object('op','create','title',card->>'title','description',coalesce(card->>'body','')||E'\n\nІдея з візуальної дошки: '||bid||' / '||(card->>'id')));
   tid:=result->>'id';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM cmo.tasks t WHERE t.workspace_key='pavutyna-cmo' AND t.source_id=tid AND (cmo.task_permissions(a,t.runtime_payload)->>'visible')::boolean) THEN RAISE EXCEPTION 'Пов’язана задача недоступна' USING ERRCODE='42501'; END IF;
  b:=jsonb_set(b,ARRAY['convertedCards'],coalesce(b->'convertedCards','{}')||jsonb_build_object(card->>'id',tid));
  b:=jsonb_set(b,'{cards}',(SELECT jsonb_agg(CASE WHEN row_card->>'id'=card->>'id' THEN row_card||jsonb_build_object('kind','task','taskId',tid) ELSE row_card END) FROM jsonb_array_elements(b->'cards') row_card));
 ELSIF op='portal' THEN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'cards') row_card WHERE row_card->>'taskId'=body->>'id') THEN RAISE EXCEPTION 'Задача не належить цій дошці'; END IF;
  IF body->>'destination'='handoff' THEN result:=cmo.request(body||jsonb_build_object('op','handoff'));
  ELSIF body->>'destination' IN ('review','ready') THEN result:=cmo.request(body||jsonb_build_object('op','move','lane',body->>'destination'));
  ELSE RAISE EXCEPTION 'Невідома зона передачі'; END IF;
 ELSE RAISE EXCEPTION 'Невідома дія'; END IF;
 b:=b||jsonb_build_object('updated',now());boards:=jsonb_set(boards,ARRAY[idx::text],b);
 next:=CASE WHEN jsonb_typeof(d.payload)='array' THEN boards ELSE jsonb_set(d.payload,'{boards}',boards) END;
 IF octet_length(next::text)>1500000 THEN RAISE EXCEPTION 'Дошка завелика'; END IF;
 UPDATE cmo.space_documents SET payload=next,revision=revision+1,updated_at=now() WHERE key='visual';
 INSERT INTO cmo.space_document_events(document_key,actor_id,revision,payload) VALUES('visual',(a->>'id')::uuid,d.revision+1,next);
 RETURN jsonb_build_object('revision',d.revision+1,'taskId',tid);
END $$;
REVOKE ALL ON FUNCTION cmo.board_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.board_action(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION api.cmo_board_action(body jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT cmo.board_action(body) $$;
REVOKE ALL ON FUNCTION api.cmo_board_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.cmo_board_action(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
