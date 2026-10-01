BEGIN;
DO $$
DECLARE o uuid:=gen_random_uuid();e uuid:=gen_random_uuid();x uuid:=gen_random_uuid();s text:=gen_random_uuid()::text;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at,aud,role) SELECT id,email,now(),now(),now(),'authenticated','authenticated' FROM (VALUES(o,'review-owner-'||s||'@example.invalid'),(e,'review-editor-'||s||'@example.invalid'),(x,'review-outsider-'||s||'@example.invalid')) v(id,email);
 INSERT INTO cmo.members(email,name,role) VALUES('review-owner-'||s||'@example.invalid','ReviewOwner-'||s,'owner'),('review-editor-'||s||'@example.invalid','ReviewEditor-'||s,'executor'),('review-outsider-'||s||'@example.invalid','ReviewOutsider-'||s,'executor');
 PERFORM set_config('cmo.review_test',jsonb_build_object('o',o,'e',e,'x',x,'s',s)::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE f jsonb:=current_setting('cmo.review_test')::jsonb;r jsonb;tid text;a1 jsonb;a2 jsonb;v integer;denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'o','role','authenticated')::text,true);
 r:=api.cmo_workspace(jsonb_build_object('op','create','title','Review fixture','assignee','ReviewEditor-'||(f->>'s')));tid:=r->>'id';v:=1;
 PERFORM set_config('cmo.review_task',tid,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'e','role','authenticated')::text,true);
 r:=api.cmo_creative_action(jsonb_build_object('op','prepare','id',tid,'version',v,'name','v1.png','size',20,'mime','image/png'));a1:=r->'attachment';v:=(r->>'version')::integer;
 IF a1->>'assetVersion'<>'1' THEN RAISE EXCEPTION 'V1 missing'; END IF;
 PERFORM set_config('cmo.review_a1',a1::text,true);PERFORM set_config('cmo.review_version',v::text,true);
END $$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,metadata) SELECT 'cmo-task-files',current_setting('cmo.review_a1')::jsonb->>'path','{"size":20,"mimetype":"image/png"}';
SET LOCAL ROLE authenticated;
DO $$
DECLARE f jsonb:=current_setting('cmo.review_test')::jsonb;tid text:=current_setting('cmo.review_task');a1 jsonb:=current_setting('cmo.review_a1')::jsonb;a2 jsonb;r jsonb;v integer:=current_setting('cmo.review_version')::integer;denied boolean;
BEGIN
 r:=api.cmo_workspace(jsonb_build_object('op','attachment_confirm','id',tid,'version',v,'attachmentId',a1->>'id'));v:=v+1;
 denied:=false;BEGIN PERFORM api.cmo_creative_action(jsonb_build_object('op','review','id',tid,'version',v,'attachmentId',a1->>'id','status','approved'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Executor approved'; END IF;
 PERFORM api.cmo_creative_action(jsonb_build_object('op','comment','id',tid,'version',v,'attachmentId',a1->>'id','text','Point comment','x',30,'y',40));v:=v+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'o','role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',tid,'version',v,'lane','ready'));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Unapproved creative launched'; END IF;
 PERFORM api.cmo_creative_action(jsonb_build_object('op','review','id',tid,'version',v,'attachmentId',a1->>'id','status','approved'));v:=v+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'e','role','authenticated')::text,true);
 r:=api.cmo_creative_action(jsonb_build_object('op','prepare','id',tid,'version',v,'name','v2.png','size',20,'mime','image/png','assetId',a1->>'assetId'));a2:=r->'attachment';v:=v+1;
 IF a2->>'assetVersion'<>'2' OR a2->'review'->>'status'<>'pending' THEN RAISE EXCEPTION 'V2 inherited approval'; END IF;
 PERFORM api.cmo_inbox_action(jsonb_build_object('op','read','id',tid,'version',v));
 PERFORM api.cmo_inbox_action(jsonb_build_object('op','snooze','id',tid,'version',v,'hours',24));
 r:=api.cmo_inbox_action('{"op":"list"}');IF jsonb_array_length(r->'preferences')<>1 THEN RAISE EXCEPTION 'Preference missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'o','role','authenticated')::text,true);
 r:=api.cmo_inbox_action('{"op":"list"}');IF jsonb_array_length(r->'preferences')<>0 THEN RAISE EXCEPTION 'Preferences leaked across actors'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_creative_action(jsonb_build_object('op','review','id',tid,'version',v,'attachmentId',a1->>'id','status','approved'));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Old version approved while new pending'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',tid,'version',v,'lane','ready'));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Pending V2 launched'; END IF;
 PERFORM set_config('cmo.review_a2',a2::text,true);PERFORM set_config('cmo.review_version',v::text,true);
END $$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,metadata) SELECT 'cmo-task-files',current_setting('cmo.review_a2')::jsonb->>'path','{"size":20,"mimetype":"image/png"}';
SET LOCAL ROLE authenticated;
DO $$
DECLARE f jsonb:=current_setting('cmo.review_test')::jsonb;tid text:=current_setting('cmo.review_task');a2 jsonb:=current_setting('cmo.review_a2')::jsonb;v integer:=current_setting('cmo.review_version')::integer;r jsonb;denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'e','role','authenticated')::text,true);
 PERFORM api.cmo_workspace(jsonb_build_object('op','attachment_confirm','id',tid,'version',v,'attachmentId',a2->>'id'));v:=v+1;
 r:=api.cmo_inbox_action('{"op":"list"}');IF (r->'preferences'->0->>'snoozeVersion')::integer=v THEN RAISE EXCEPTION 'Snooze hid new version'; END IF;
 PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',tid,'version',v,'lane','review','result','Ready for review'));v:=v+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'o','role','authenticated')::text,true);
 PERFORM api.cmo_creative_action(jsonb_build_object('op','review','id',tid,'version',v,'attachmentId',a2->>'id','status','changes','text','Fix headline'));v:=v+1;
 r:=api.cmo_workspace('{"op":"list"}');IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'tasks') t WHERE t->>'id'=tid AND t->>'lane'='todo') THEN RAISE EXCEPTION 'Changes did not return task'; END IF;
 PERFORM api.cmo_creative_action(jsonb_build_object('op','review','id',tid,'version',v,'attachmentId',a2->>'id','status','approved'));v:=v+1;
 PERFORM api.cmo_workspace(jsonb_build_object('op','move','id',tid,'version',v,'lane','ready'));v:=v+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'x','role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM api.cmo_creative_action(jsonb_build_object('op','comment','id',tid,'version',v,'attachmentId',a2->>'id','text','Intrusion'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Outsider commented'; END IF;
 denied:=false;BEGIN PERFORM api.cmo_inbox_action(jsonb_build_object('op','read','id',tid,'version',v));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Outsider modified inbox'; END IF;
END $$;
ROLLBACK;
