BEGIN;
DO $$ DECLARE o uuid:=gen_random_uuid();e uuid:=gen_random_uuid();s text:=gen_random_uuid()::text;BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at,aud,role) VALUES(o,'progress-owner-'||s||'@example.invalid',now(),now(),now(),'authenticated','authenticated'),(e,'progress-member-'||s||'@example.invalid',now(),now(),now(),'authenticated','authenticated');
 INSERT INTO cmo.members(email,name,role) VALUES('progress-owner-'||s||'@example.invalid','ProgressOwner-'||s,'owner'),('progress-member-'||s||'@example.invalid','ProgressMember-'||s,'executor');
 PERFORM set_config('cmo.progress_test',jsonb_build_object('o',o,'e',e)::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE f jsonb:=current_setting('cmo.progress_test')::jsonb;d jsonb;r jsonb;rev integer;denied boolean;p jsonb;BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'o','role','authenticated')::text,true);
 SELECT value INTO d FROM jsonb_array_elements(api.cmo_owner_data('{"op":"list"}')->'documents') WHERE value->>'key'='campaigns';rev:=(d->>'revision')::integer;
 r:=api.cmo_owner_data(jsonb_build_object('op','save','key','campaigns','revision',rev,'payload','[{"id":"progress-fixture","name":"Fixture","progress":42,"unknownField":"keep","taskIds":[]}]'::jsonb));rev:=(r->>'revision')::integer;
 denied:=false;BEGIN PERFORM api.cmo_project_action(jsonb_build_object('op','hill','key','campaigns','id','progress-fixture','revision',rev,'position',110,'note','Bad'));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Invalid position allowed';END IF;
 r:=api.cmo_project_action(jsonb_build_object('op','hill','key','campaigns','id','progress-fixture','revision',rev,'position',65,'note','Path is clear'));rev:=(r->>'revision')::integer;
 denied:=false;BEGIN PERFORM api.cmo_project_action(jsonb_build_object('op','hill','key','campaigns','id','progress-fixture','revision',rev-1,'position',20,'note','Stale'));EXCEPTION WHEN serialization_failure THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'CAS bypassed';END IF;
 r:=api.cmo_project_action(jsonb_build_object('op','hill','key','campaigns','id','progress-fixture','revision',rev,'position',30,'note','New unknown'));rev:=(r->>'revision')::integer;
 denied:=false;BEGIN PERFORM api.cmo_project_action(jsonb_build_object('op','weekly','key','campaigns','id','progress-fixture','revision',rev,'health','blocked','summary','Update','next','Next'));EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Blocker without reason';END IF;
 r:=api.cmo_project_action(jsonb_build_object('op','weekly','key','campaigns','id','progress-fixture','revision',rev,'health','on_track','summary','First report','next','Owner, Monday','author','Forged','week','2000-01-01'));rev:=(r->>'revision')::integer;
 IF r->'entry'->>'author'='Forged' OR r->'entry'->>'week'='2000-01-01' THEN RAISE EXCEPTION 'Client forged audit';END IF;
 r:=api.cmo_project_action(jsonb_build_object('op','weekly','key','campaigns','id','progress-fixture','revision',rev,'health','at_risk','summary','Correction','risk','Awaiting decision','next','Owner, Friday'));rev:=(r->>'revision')::integer;
 IF r->'entry'->>'revision'<>'2' THEN RAISE EXCEPTION 'Weekly revisions missing';END IF;
 SELECT value->'payload'->0 INTO p FROM jsonb_array_elements(api.cmo_owner_data('{"op":"list"}')->'documents') WHERE value->>'key'='campaigns';
 IF p->>'progress'<>'42' OR p->>'unknownField'<>'keep' OR jsonb_array_length(p->'hillHistory')<>2 OR jsonb_array_length(p->'weeklyUpdates')<>2 OR p->'weeklyUpdates'->0->>'summary'<>'First report' THEN RAISE EXCEPTION 'Data/history lost';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'e','role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM api.cmo_project_action(jsonb_build_object('op','hill','key','campaigns','id','progress-fixture','revision',rev,'position',80,'note','Denied'));EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'Executor accessed owner projects';END IF;
END $$;
RESET ROLE;
SELECT 'passed: owner permissions, CAS, independent Hill history, Kyiv weekly revisions, preserved fields and server audit' AS verification;
ROLLBACK;
