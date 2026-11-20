-- Файли в CMO Space (20.11.2026): будь-які формати, крім виконуваних і веб-сторінок, до 50 МБ (ліміт Free-плану Supabase на файл).
-- Великі файли клієнт вантажить resumable (TUS) шматками по 6 МБ — див. storage-upload.js.
UPDATE storage.buckets SET file_size_limit=52428800, allowed_mime_types=NULL WHERE id='cmo-task-files';
UPDATE storage.buckets SET file_size_limit=52428800,
 allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'] WHERE id='cmo-ooh-photos';

CREATE OR REPLACE FUNCTION cmo.file_name_allowed(name text, mime text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
 SELECT length(COALESCE(name,'')) BETWEEN 1 AND 255
  AND NOT (COALESCE(lower(substring(name from '\.([^.]+)$')),'') = ANY(ARRAY['exe','msi','bat','cmd','com','scr','pif','ps1','vbs','vbe','js','mjs','jse','wsf','jar','apk','app','dmg','pkg','sh','reg','lnk','html','htm','xhtml','hta','php']))
  AND COALESCE(mime,'') !~* '(html|javascript|x-msdownload|x-sh)'
  AND length(COALESCE(mime,'')) BETWEEN 3 AND 255
$$;

-- cmo.request / attachment_prepare: замість білого списку MIME і 20 МБ — cmo.file_name_allowed і 50 МБ.
DO $$
DECLARE src text := pg_get_functiondef('cmo.request(jsonb)'::regprocedure);
 old text := $o$IF length(COALESCE(body->>'name','')) NOT BETWEEN 1 AND 255 OR body->>'size' IS NULL OR body->>'mime' IS NULL OR (body->>'size')::bigint NOT BETWEEN 1 AND 20971520 OR body->>'mime' NOT IN ('image/svg+xml','image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/json','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','video/mp4','audio/mpeg','audio/wav') THEN RAISE EXCEPTION 'Файл має бути підтримуваного формату, до 20 МБ'; END IF;$o$;
 new text := $n$IF body->>'size' IS NULL OR (body->>'size')::bigint NOT BETWEEN 1 AND 52428800 THEN RAISE EXCEPTION 'Файл завеликий: максимум 50 МБ. Більші файли додай посиланням (Google Drive)'; END IF;
  IF NOT cmo.file_name_allowed(body->>'name',body->>'mime') THEN RAISE EXCEPTION 'Такий тип файлу завантажувати не можна (виконувані або веб-сторінки). Заархівуй у ZIP'; END IF;$n$;
BEGIN
 IF position(old IN src)=0 THEN
  IF position('cmo.file_name_allowed' IN src)>0 THEN RETURN; END IF;
  RAISE EXCEPTION 'cmo.request: не знайдено старої перевірки файлу';
 END IF;
 EXECUTE replace(src,old,new);
END $$;
