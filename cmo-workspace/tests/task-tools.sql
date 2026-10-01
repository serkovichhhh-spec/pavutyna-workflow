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
DECLARE a jsonb:=current_setting('cmo.test_actors')::jsonb;s text:=a->>'s';r jsonb;task text;v integer:=1;cid text;f jsonb;denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'o','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','create','title','Task tools fixture','assignee','Executor-'||s));task:=r->>'id';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'e','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','checklist_add','id',task,'version',v,'text','First step'));v:=(r->>'version')::int;
 r:=api.cmo_workspace(jsonb_build_object('op','checklist_edit','id',task,'version',v,'index',0,'text','Updated step'));v:=(r->>'version')::int;
 r:=api.cmo_workspace(jsonb_build_object('op','check','id',task,'version',v,'index',0,'done',true));v:=(r->>'version')::int;
 r:=api.cmo_workspace(jsonb_build_object('op','checklist_remove','id',task,'version',v,'index',0));v:=(r->>'version')::int;
 r:=api.cmo_workspace(jsonb_build_object('op','subtask_create','id',task,'version',v,'title','Child step'));v:=(r->>'version')::int;cid:=r->>'childId';
 IF cid IS NULL THEN RAISE EXCEPTION 'Missing child';END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','review','result','Result'));EXCEPTION WHEN raise_exception THEN denied:=SQLERRM='Спочатку заверши й прийми підзадачі';END;
 IF NOT denied THEN RAISE EXCEPTION 'Parent bypassed incomplete child';END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','attachment_prepare','id',task,'version',v,'name','No metadata'));EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Missing metadata accepted';END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','attachment_prepare','id',task,'version',v,'name','Bad.html','size',5,'mime','text/html'));EXCEPTION WHEN raise_exception THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'HTML upload accepted';END IF;
 r:=api.cmo_workspace(jsonb_build_object('op','attachment_prepare','id',task,'version',v,'name','fixture.txt','size',5,'mime','text/plain'));v:=(r->>'version')::int;f:=r->'attachment';
 IF NOT cmo.file_access(f->>'path','upload') THEN RAISE EXCEPTION 'Uploader denied';END IF;
 -- Metadata-only fixture proves Storage RLS and confirmation; all objects roll back, no live file is uploaded.
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('cmo-task-files',f->>'path','{"size":5,"mimetype":"text/plain"}');
 r:=api.cmo_workspace(jsonb_build_object('op','attachment_confirm','id',task,'version',v,'attachmentId',f->>'id'));v:=(r->>'version')::int;
 IF NOT cmo.file_access(f->>'path','read') OR cmo.file_access(f->>'path','upload') THEN RAISE EXCEPTION 'Confirmed file scope wrong';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'d','role','authenticated')::text,true);
 IF cmo.file_access(f->>'path','read') OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='cmo-task-files' AND name=f->>'path') THEN RAISE EXCEPTION 'Other executor read file';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'e','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','move','id',cid,'version',1,'lane','review','result','Child result'));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'o','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','move','id',cid,'version',2,'lane','done'));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'e','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','task_link','id',task,'version',v,'targetId',cid,'relation','related'));v:=(r->>'version')::int;
 r:=api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','review','result','All results'));v:=(r->>'version')::int;
 IF cmo.file_access(f->>'path','upload') THEN RAISE EXCEPTION 'Review allows upload';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a->>'o','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','move','id',task,'version',v,'lane','done'));v:=(r->>'version')::int;
 r:=api.cmo_workspace(jsonb_build_object('op','attachment_remove','id',task,'version',v,'attachmentId',f->>'id'));
 IF cmo.file_access(f->>'path','read') THEN RAISE EXCEPTION 'Removed attachment remained readable';END IF;
 v:=(r->>'version')::int;r:=api.cmo_workspace(jsonb_build_object('op','attachment_restore','id',task,'version',v,'attachmentId',f->>'id'));IF NOT cmo.file_access(f->>'path','read') THEN RAISE EXCEPTION 'Restore failed';END IF;
END $$;
ROLLBACK;
SELECT 'passed: checklist structure, real child tasks, parent acceptance gate, private Storage RLS and file metadata; fixtures rolled back' AS verification;
