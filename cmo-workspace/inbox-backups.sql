-- Include personal Inbox state in future backups; older backup packets stay readable.
DO $$
DECLARE definition text; signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['cmo.create_workspace_backup()','cmo.verify_workspace_backup(bigint)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF definition NOT LIKE '%''inbox_preferences''%' THEN
   IF definition NOT LIKE '%''space_document_events'']%' THEN RAISE EXCEPTION 'Backup function changed; review the migration'; END IF;
   definition:=replace(definition,'''space_document_events'']','''space_document_events'',''inbox_preferences'']');
   IF signature='cmo.create_workspace_backup()' THEN definition:=replace(definition,'cmo.space_document_events IN SHARE MODE','cmo.space_document_events,cmo.inbox_preferences IN SHARE MODE');
   ELSE definition:=replace(definition,'saved:=b.payload->''tables''->table_name;','IF table_name=''inbox_preferences'' AND NOT (b.payload->''tables'' ? table_name) THEN CONTINUE; END IF; saved:=b.payload->''tables''->table_name;'); END IF;
   EXECUTE definition;
  END IF;
 END LOOP;
END $$;
