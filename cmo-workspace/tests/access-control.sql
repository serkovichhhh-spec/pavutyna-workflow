-- Fixtures are isolated and rolled back; no real task or account is changed.
BEGIN;
DO $$
DECLARE o uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); s text:=gen_random_uuid()::text;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at,aud,role)
 SELECT x.id,x.email,now(),now(),now(),'authenticated','authenticated' FROM (VALUES
 (o,'owner-'||s||'@example.invalid'),(i,'intake-'||s||'@example.invalid'),
 (e,'executor-'||s||'@example.invalid'),(d,'destination-'||s||'@example.invalid'),(n,'nonmember-'||s||'@example.invalid')) x(id,email);
 INSERT INTO cmo.members(email,name,role) VALUES
 ('owner-'||s||'@example.invalid','Owner-'||s,'owner'),('intake-'||s||'@example.invalid','Intake-'||s,'intake'),
 ('executor-'||s||'@example.invalid','Executor-'||s,'executor'),('destination-'||s||'@example.invalid','Destination-'||s,'executor');
 PERFORM set_config('cmo.test_actors',jsonb_build_object('o',o,'i',i,'e',e,'d',d,'n',n,'s',s)::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE a jsonb:=current_setting('cmo.test_actors')::jsonb; s text:=a->>'s'; r jsonb; task text; v integer:=1; denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'i','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','create','title','Access fixture','assignee','Executor-'||s));task:=r->>'id';
 r:=api.cmo_workspace('{"op":"list"}');
 IF jsonb_array_length(r->'tasks')<>1 OR (r->'tasks'->0->'permissions'->>'work')::boolean THEN RAISE EXCEPTION 'Creator scope is incorrect'; END IF;
 PERFORM api.cmo_workspace(jsonb_build_object('op','comment','id',task,'version',v,'text','Clarification'));v:=v+1;
 denied:=false;BEGIN PERFORM api.cmo_owner_data('{"op":"list"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Intake read owner documents'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'e','role','authenticated')::text,true);
 r:=api.cmo_workspace('{"op":"list"}');
 IF jsonb_array_length(r->'tasks')<>1 OR NOT (r->'tasks'->0->'permissions'->>'work')::boolean THEN RAISE EXCEPTION 'Executor scope is incorrect'; END IF;
 PERFORM api.cmo_workspace(jsonb_build_object('op','handoff','id',task,'version',v,'assignee','Destination-'||s,'text','Next step'));v:=v+1;
 r:=api.cmo_workspace('{"op":"list"}');
 IF jsonb_array_length(r->'tasks')<>1 OR (r->'tasks'->0->'permissions'->>'work')::boolean OR NOT (r->'tasks'->0->'permissions'->>'comment')::boolean THEN RAISE EXCEPTION 'Sender should retain only read/comment';END IF;
 PERFORM api.cmo_workspace(jsonb_build_object('op','comment','id',task,'version',v,'text','Handoff context'));v:=v+1;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','progress'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Sender changed reassigned task';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'d','role','authenticated')::text,true);
 PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','progress'));v:=v+1;
 PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','review','result','Result'));v:=v+1;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','progress'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor bypassed review';END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','handoff','id',task,'version',v,'assignee','Executor-'||s,'text','Bypass review'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Handoff bypassed review';END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','done'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor accepted own result';END IF;
 denied:=false;BEGIN PERFORM api.cmo_backup_status('{}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor read backup status';END IF;
 denied:=false;BEGIN PERFORM api.cmo_owner_data('{"op":"export"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Executor exported private documents';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'o','role','authenticated')::text,true);
 PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','todo','result','Revision required'));v:=v+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'d','role','authenticated')::text,true);
 PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','review','result','Revised result'));v:=v+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'o','role','authenticated')::text,true);
 PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','done'));v:=v+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'d','role','authenticated')::text,true);
 r:=api.cmo_workspace('{"op":"list"}');
 IF (r->'tasks'->0->'permissions'->>'work')::boolean THEN RAISE EXCEPTION 'Executor edited accepted result';END IF;
 PERFORM api.cmo_workspace(jsonb_build_object('op','comment','id',task,'version',v,'text','Accepted result context'));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'n','role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM api.cmo_workspace('{"op":"list"}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Nonmember obtained workspace';END IF;
END $$;
ROLLBACK;
SELECT 'passed: authenticated role, creator scope, handoff visibility, review boundary, private endpoints, nonmember denial; all fixtures rolled back' AS verification;
