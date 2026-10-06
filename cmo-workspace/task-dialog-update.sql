-- Incremental update for an existing task-tools installation.
-- Apply with the matching frontend release. Keeps function grants and RLS unchanged.
BEGIN;
DO $patch$
DECLARE definition text:=pg_get_functiondef('cmo.request(jsonb)'::regprocedure);
 old_gate text:=$old$IF next_lane='done' AND t.lane<>'review' THEN$old$;
 new_gate text:=$new$IF next_lane='done' AND t.lane NOT IN ('review','ready') THEN$new$;
 result_branch text:=$branch$ ELSIF op='result' THEN
   IF body->>'result' IS NULL OR length(body->>'result')>10000 THEN RAISE EXCEPTION 'Результат має бути до 10000 символів'; END IF;
   p:=jsonb_set(p,'{result}',to_jsonb(trim(body->>'result')));
   event:=jsonb_build_object('action','Збережено результат / причину','note','');
 ELSIF op='move' THEN$branch$;
BEGIN
 IF position($marker$ELSIF op='attachment_prepare' THEN$marker$ IN definition)=0 THEN RAISE EXCEPTION 'Task-tools installation required'; END IF;
 IF position(old_gate IN definition)>0 THEN definition:=replace(definition,old_gate,new_gate);
 ELSIF position(new_gate IN definition)=0 THEN RAISE EXCEPTION 'Acceptance guard changed; review before applying'; END IF;
 IF position($marker$ ELSIF op='result' THEN$marker$ IN definition)=0 THEN
   IF position($marker$ ELSIF op='move' THEN$marker$ IN definition)=0 THEN RAISE EXCEPTION 'Move branch changed; review before applying'; END IF;
   definition:=replace(definition,$marker$ ELSIF op='move' THEN$marker$,result_branch);
 END IF;
 IF position($mime$'image/svg+xml'$mime$ IN definition)=0 THEN
   IF position($mime$body->>'mime' NOT IN ('image/jpeg'$mime$ IN definition)=0 THEN RAISE EXCEPTION 'MIME validation changed; review before applying'; END IF;
   definition:=replace(definition,$mime$body->>'mime' NOT IN ('image/jpeg'$mime$,$mime$body->>'mime' NOT IN ('image/svg+xml','image/jpeg'$mime$);
 END IF;
 EXECUTE definition;
END $patch$;
-- Preserve the private bucket, existing MIME types and existing file-size limit.
UPDATE storage.buckets SET allowed_mime_types=array_append(allowed_mime_types,'image/svg+xml')
WHERE id='cmo-task-files' AND allowed_mime_types IS NOT NULL
 AND NOT ('image/svg+xml'=ANY(allowed_mime_types));
NOTIFY pgrst,'reload schema';
COMMIT;
