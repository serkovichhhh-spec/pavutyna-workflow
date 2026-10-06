-- Run after task-dialog-update.sql inside a transaction that is rolled back.
-- Uses existing QA actors; creates only a synthetic task, no physical Storage object.
DO $test$
DECLARE task_id text; v int:=1; r jsonb; payload jsonb; denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','96b3e75f-d35c-40df-aee1-0059ecf8dca9',true);
 PERFORM set_config('request.jwt.claims','{"sub":"96b3e75f-d35c-40df-aee1-0059ecf8dca9","role":"authenticated"}',true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=api.cmo_workspace('{"op":"create","title":"[QA rollback] Task dialog update","assignee":"QA · Виконавець"}');task_id:=r->>'id';
 PERFORM set_config('request.jwt.claim.sub','52fb242f-8870-4e84-b2b0-d33fe3d821aa',true);
 PERFORM set_config('request.jwt.claims','{"sub":"52fb242f-8870-4e84-b2b0-d33fe3d821aa","role":"authenticated"}',true);
 r:=api.cmo_workspace(jsonb_build_object('op','result','id',task_id,'version',v,'result','  Saved without transition  '));v:=(r->>'version')::int;
 SELECT x INTO payload FROM jsonb_array_elements(api.cmo_workspace('{"op":"list"}')->'tasks') x WHERE x->>'id'=task_id;
 IF payload->>'lane'<>'todo' OR payload->>'result'<>'Saved without transition' OR v<>2 THEN RAISE EXCEPTION 'Standalone result save failed'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','result','id',task_id,'version',1,'result','Stale'));EXCEPTION WHEN serialization_failure THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale result version accepted'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','result','id',task_id,'version',v,'result',repeat('x',10001)));EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Result limit bypassed'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','result','id','task-590613c5-ce8d-48d7-8d46-f4a12000ff9e','version',6,'result','Forbidden'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Foreign result modified'; END IF;
 r:=api.cmo_workspace(jsonb_build_object('op','attachment_prepare','id',task_id,'version',v,'name','logo.svg','size',97,'mime','image/svg+xml'));v:=(r->>'version')::int;
 IF r->'attachment'->>'mime'<>'image/svg+xml' OR NOT cmo.file_access(r->'attachment'->>'path','upload') THEN RAISE EXCEPTION 'SVG upload preparation denied'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','attachment_prepare','id',task_id,'version',v,'name','bad.html','size',97,'mime','text/html'));EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'HTML permitted'; END IF;
 r:=api.cmo_workspace(jsonb_build_object('op','result','id',task_id,'version',v,'result',''));v:=(r->>'version')::int;
 SELECT x INTO payload FROM jsonb_array_elements(api.cmo_workspace('{"op":"list"}')->'tasks') x WHERE x->>'id'=task_id;
 IF payload->>'result'<>'' OR payload->>'lane'<>'todo' THEN RAISE EXCEPTION 'Result clear changed lane'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task_id,'version',v,'lane','done'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor acceptance permitted'; END IF;
 r:=api.cmo_workspace(jsonb_build_object('op','move','id',task_id,'version',v,'lane','review','result','Reviewed deliverable'));v:=(r->>'version')::int;
 PERFORM set_config('request.jwt.claim.sub','96b3e75f-d35c-40df-aee1-0059ecf8dca9',true);
 PERFORM set_config('request.jwt.claims','{"sub":"96b3e75f-d35c-40df-aee1-0059ecf8dca9","role":"authenticated"}',true);
 r:=api.cmo_workspace(jsonb_build_object('op','move','id',task_id,'version',v,'lane','ready'));v:=(r->>'version')::int;
 PERFORM set_config('request.jwt.claim.sub','52fb242f-8870-4e84-b2b0-d33fe3d821aa',true);
 PERFORM set_config('request.jwt.claims','{"sub":"52fb242f-8870-4e84-b2b0-d33fe3d821aa","role":"authenticated"}',true);
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','result','id',task_id,'version',v,'result','Locked edit'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor changed ready result'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task_id,'version',v,'lane','done'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor completed ready task'; END IF;
 PERFORM set_config('request.jwt.claim.sub','96b3e75f-d35c-40df-aee1-0059ecf8dca9',true);
 PERFORM set_config('request.jwt.claims','{"sub":"96b3e75f-d35c-40df-aee1-0059ecf8dca9","role":"authenticated"}',true);
 r:=api.cmo_workspace(jsonb_build_object('op','move','id',task_id,'version',v,'lane','done'));
 SELECT x INTO payload FROM jsonb_array_elements(api.cmo_workspace('{"op":"list"}')->'tasks') x WHERE x->>'id'=task_id;
 IF payload->>'lane'<>'done' OR payload->>'result'<>'Reviewed deliverable' THEN RAISE EXCEPTION 'Owner ready completion failed'; END IF;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='cmo-task-files' AND NOT public AND file_size_limit=20971520 AND 'image/svg+xml'=ANY(allowed_mime_types) AND 'image/png'=ANY(allowed_mime_types)) THEN RAISE EXCEPTION 'Bucket configuration damaged'; END IF;
END $test$;
