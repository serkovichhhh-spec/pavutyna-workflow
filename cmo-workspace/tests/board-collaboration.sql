-- Isolated fixtures; every change, including test users, is rolled back.
BEGIN;
DO $$
DECLARE o uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); s text:=gen_random_uuid()::text;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at,aud,role)
 SELECT id,email,now(),now(),now(),'authenticated','authenticated' FROM (VALUES(o,'board-owner-'||s||'@example.invalid'),(e,'board-editor-'||s||'@example.invalid'),(x,'board-outsider-'||s||'@example.invalid')) v(id,email);
 INSERT INTO cmo.members(email,name,role) VALUES('board-owner-'||s||'@example.invalid','BoardOwner-'||s,'owner'),('board-editor-'||s||'@example.invalid','BoardEditor-'||s,'executor'),('board-outsider-'||s||'@example.invalid','BoardOutsider-'||s,'executor');
 PERFORM set_config('cmo.board_test',jsonb_build_object('o',o,'e',e,'x',x,'s',s)::text,true);
 UPDATE cmo.space_documents SET payload='{"boards":[{"id":"fixture","name":"Fixture","cards":[{"id":"idea","kind":"note","title":"Fixture idea","body":"Brief"},{"id":"idea2","kind":"note","title":"Second"},{"id":"idea3","kind":"note","title":"Third"}],"edges":[]}],"active":"fixture"}',revision=1 WHERE key='visual';
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE f jsonb:=current_setting('cmo.board_test')::jsonb; r jsonb; tid text; doc jsonb; b jsonb; sid text; denied boolean; before_count integer;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'o','role','authenticated')::text,true);
 PERFORM api.cmo_board_action(jsonb_build_object('op','share','boardId','fixture','revision',1,'members',jsonb_build_array('BoardEditor-'||(f->>'s'))));
 r:=api.cmo_board_action(jsonb_build_object('op','convert','boardId','fixture','cardId','idea','assignee','BoardOwner-'||(f->>'s')));tid:=r->>'taskId';
 IF tid IS NULL THEN RAISE EXCEPTION 'Conversion missing task'; END IF;
 r:=api.cmo_board_action(jsonb_build_object('op','convert','boardId','fixture','cardId','idea','assignee','BoardEditor-'||(f->>'s')));
 IF r->>'taskId'<>tid THEN RAISE EXCEPTION 'Conversion is not idempotent'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'e','role','authenticated')::text,true);
 doc:=(api.cmo_board_action('{"op":"list"}'))->'documents'->0;
 IF doc->'payload'->'boards'->0->'cards'->0->>'title'<>'Задача недоступна' THEN RAISE EXCEPTION 'Private task title leaked'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'o','role','authenticated')::text,true);
 doc:=(api.cmo_board_action('{"op":"list"}'))->'documents'->0;b:=doc->'payload'->'boards'->0;
 PERFORM api.cmo_board_action(jsonb_build_object('op','portal','boardId','fixture','revision',doc->'revision','id',tid,'version',1,'destination','handoff','assignee','BoardEditor-'||(f->>'s'),'text','Execute the brief'));
 doc:=(api.cmo_board_action('{"op":"list"}'))->'documents'->0;
 PERFORM api.cmo_board_action(jsonb_build_object('op','start','boardId','fixture','revision',doc->'revision','phase','voting','minutes',5,'votes',1));
 doc:=(api.cmo_board_action('{"op":"list"}'))->'documents'->0;sid:=doc->'payload'->'boards'->0->'session'->>'id';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'e','role','authenticated')::text,true);
 r:=api.cmo_board_action('{"op":"list"}');IF jsonb_array_length(r->'documents'->0->'payload'->'boards')<>1 THEN RAISE EXCEPTION 'Shared board inaccessible'; END IF;
 PERFORM api.cmo_board_action(jsonb_build_object('op','vote','boardId','fixture','cardId','idea2','sessionId',sid));
 denied:=false;BEGIN PERFORM api.cmo_board_action(jsonb_build_object('op','vote','boardId','fixture','cardId','idea3','sessionId',sid));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Vote cap bypassed'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_board_action(jsonb_build_object('op','vote','boardId','fixture','cardId','idea2','sessionId','stale-session'));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Stale session accepted'; END IF;
 r:=api.cmo_board_action('{"op":"list"}');IF r->'documents'->0->'payload'->'boards'->0->'session'->'myVotes'->>'idea2'<>'1' THEN RAISE EXCEPTION 'Vote missing'; END IF;
 IF r->'documents'->0->'payload'->'boards'->0->'session' ? 'ballots' THEN RAISE EXCEPTION 'Other identities leaked'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_owner_data('{"op":"list"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Owner documents exposed'; END IF;
 doc:=r->'documents'->0;b:=doc->'payload'->'boards'->0;
 PERFORM api.cmo_board_action(jsonb_build_object('op','save','boardId','fixture','revision',doc->'revision','board',b||jsonb_build_object('members',jsonb_build_array('BoardOutsider-'||(f->>'s')),'session','{}'::jsonb)));
 denied:=false;BEGIN PERFORM api.cmo_board_action(jsonb_build_object('op','share','boardId','fixture','revision',999,'members','[]'::jsonb));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Executor changed membership'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_board_action(jsonb_build_object('op','save','boardId','fixture','revision',1,'board',b));EXCEPTION WHEN serialization_failure THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Stale write accepted'; END IF;
 doc:=(api.cmo_board_action('{"op":"list"}'))->'documents'->0;
 denied:=false;BEGIN PERFORM api.cmo_board_action(jsonb_build_object('op','portal','boardId','fixture','revision',doc->'revision','id',tid,'version',2,'destination','ready','result','Done'));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Executor approved task'; END IF;
 PERFORM api.cmo_board_action(jsonb_build_object('op','portal','boardId','fixture','revision',doc->'revision','id',tid,'version',2,'destination','review','result','Work completed'));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'x','role','authenticated')::text,true);
 r:=api.cmo_board_action('{"op":"list"}');IF jsonb_array_length(r->'documents'->0->'payload'->'boards')<>0 THEN RAISE EXCEPTION 'Outsider can see board'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_board_action(jsonb_build_object('op','vote','boardId','fixture','cardId','idea2','sessionId',sid));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Outsider voted'; END IF;
END $$;
ROLLBACK;
