-- All fixtures and mutations are rolled back. No production task is modified.
BEGIN;
DO $$
DECLARE o uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
 suffix text:=gen_random_uuid()::text; r jsonb; id text; denied boolean; before_count integer; snapshot jsonb;
BEGIN
 SELECT count(*) INTO before_count FROM cmo.tasks;
 INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at,aud,role)
 VALUES (o,'owner-'||suffix||'@example.invalid',now(),now(),now(),'authenticated','authenticated'),
 (i,'intake-'||suffix||'@example.invalid',now(),now(),now(),'authenticated','authenticated'),
 (e,'executor-'||suffix||'@example.invalid',now(),now(),now(),'authenticated','authenticated'),
 (n,'nonmember-'||suffix||'@example.invalid',now(),now(),now(),'authenticated','authenticated'),
 (u,'unconfirmed-'||suffix||'@example.invalid',NULL,now(),now(),'authenticated','authenticated');
 INSERT INTO cmo.members(email,name,role) VALUES ('owner-'||suffix||'@example.invalid','TestOwner-'||suffix,'owner'),('intake-'||suffix||'@example.invalid','TestIntake-'||suffix,'intake'),('executor-'||suffix||'@example.invalid','TestExecutor-'||suffix,'executor'),('unconfirmed-'||suffix||'@example.invalid','TestUnconfirmed-'||suffix,'owner');
 IF has_function_privilege('anon','api.cmo_workspace(jsonb)','EXECUTE') OR has_table_privilege('authenticated','cmo.tasks','SELECT') THEN RAISE EXCEPTION 'Direct unauthorized access exists'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',n,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM cmo.request('{"op":"list"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Nonmember could read';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM cmo.request('{"op":"list"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Unconfirmed email could read';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated')::text,true);
 r:=cmo.request(jsonb_build_object('op','create','title','Authorization test','assignee','TestExecutor-'||suffix));id:=r->>'id';
 SELECT original_payload INTO snapshot FROM cmo.tasks WHERE source_id=id;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',e,'role','authenticated')::text,true);
 IF jsonb_array_length(cmo.request('{"op":"list"}')->'tasks')<>1 THEN RAISE EXCEPTION 'Executor could see unrelated tasks';END IF;
 denied:=false;BEGIN PERFORM cmo.request('{"op":"create","title":"Denied"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor could create';END IF;
 PERFORM cmo.request(jsonb_build_object('op','move','id',id,'version',1,'lane','progress'));
 denied:=false;BEGIN PERFORM cmo.request(jsonb_build_object('op','move','id',id,'version',1,'lane','progress'));EXCEPTION WHEN serialization_failure THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale version overwrote task';END IF;
 denied:=false;BEGIN PERFORM cmo.request(jsonb_build_object('op','move','id',id,'version',2,'lane','done'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor could approve result';END IF;
 PERFORM cmo.request(jsonb_build_object('op','move','id',id,'version',2,'lane','review','result','Test result'));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM cmo.request(jsonb_build_object('op','comment','id',id,'version',3,'text','Denied'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Other assignee could mutate task';END IF;
 PERFORM cmo.request('{"op":"create","title":"Intake creation test"}');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated')::text,true);
 PERFORM cmo.request(jsonb_build_object('op','move','id',id,'version',3,'lane','done'));
 IF NOT EXISTS(SELECT 1 FROM cmo.tasks WHERE source_id=id AND version=4 AND lane='done' AND original_payload=snapshot AND jsonb_array_length(runtime_payload->'activity')=4) THEN RAISE EXCEPTION 'Snapshot/history/version preservation failed';END IF;
 UPDATE cmo.members SET active=false WHERE email='owner-'||suffix||'@example.invalid';
 denied:=false;BEGIN PERFORM cmo.request('{"op":"list"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked member retained access';END IF;
END $$;
ROLLBACK;
SELECT 'authorization, version conflict, history and snapshot tests passed; fixtures rolled back' AS verification;
