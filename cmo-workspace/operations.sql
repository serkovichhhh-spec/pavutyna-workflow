-- CMO-only logical backups. No auth secrets or TYAMA tables are included.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE TABLE IF NOT EXISTS cmo.workspace_backups(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL,
 checksum text NOT NULL,
 verification jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE cmo.workspace_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read_backups ON cmo.workspace_backups FOR SELECT TO authenticated
 USING((SELECT cmo.actor()->>'role')='owner');
GRANT SELECT ON cmo.workspace_backups TO authenticated;
REVOKE ALL ON cmo.workspace_backups FROM anon;

CREATE OR REPLACE FUNCTION cmo.verify_workspace_backup(backup_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b cmo.workspace_backups; table_name text; saved jsonb; restored jsonb; report jsonb:='{}';
BEGIN
 SELECT * INTO STRICT b FROM cmo.workspace_backups WHERE id=backup_id;
 IF b.checksum<>encode(sha256(convert_to(b.payload::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Backup checksum mismatch'; END IF;
 FOREACH table_name IN ARRAY ARRAY['members','tasks','source_snapshots','space_documents','space_snapshots','space_document_events'] LOOP
  saved:=b.payload->'tables'->table_name;
  IF jsonb_typeof(saved) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Missing backup table %',table_name; END IF;
  -- Real restore to isolated temporary tables: types, constraints and unique indexes are checked.
  EXECUTE format('DROP TABLE IF EXISTS pg_temp.%I','cmo_restore_'||table_name);
  EXECUTE format('CREATE TEMP TABLE %I (LIKE cmo.%I INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP','cmo_restore_'||table_name,table_name);
  EXECUTE format('INSERT INTO pg_temp.%I SELECT * FROM jsonb_populate_recordset(NULL::cmo.%I,$1)','cmo_restore_'||table_name,table_name) USING saved;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM pg_temp.%I t','cmo_restore_'||table_name) INTO restored;
  IF restored IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Restore differs for %',table_name; END IF;
  report:=report||jsonb_build_object(table_name,jsonb_array_length(restored));
 END LOOP;
 report:=jsonb_build_object('status','passed','verified_at',now(),'tables',report,'method','restore_into_temporary_tables');
 RETURN report;
END $$;
REVOKE ALL ON FUNCTION cmo.verify_workspace_backup(bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION cmo.create_workspace_backup() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE table_name text; rows jsonb; packet jsonb:='{}'; bid bigint; verdict jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(62931001);
 LOCK TABLE cmo.members,cmo.tasks,cmo.source_snapshots,cmo.space_documents,cmo.space_snapshots,cmo.space_document_events IN SHARE MODE;
 FOREACH table_name IN ARRAY ARRAY['members','tasks','source_snapshots','space_documents','space_snapshots','space_document_events'] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM cmo.%I t',table_name) INTO rows;
  packet:=packet||jsonb_build_object(table_name,rows);
 END LOOP;
 packet:=jsonb_build_object('schema','pavutyna-cmo-server-backup-v1','created_at',now(),'tables',packet);
 INSERT INTO cmo.workspace_backups(payload,checksum) VALUES(packet,encode(sha256(convert_to(packet::text,'UTF8')),'hex')) RETURNING id INTO bid;
 verdict:=cmo.verify_workspace_backup(bid);
 UPDATE cmo.workspace_backups SET verification=verdict WHERE id=bid;
 DELETE FROM cmo.workspace_backups WHERE id IN (SELECT id FROM cmo.workspace_backups ORDER BY created_at DESC,id DESC OFFSET 30);
 RETURN bid;
END $$;
REVOKE ALL ON FUNCTION cmo.create_workspace_backup() FROM PUBLIC,anon,authenticated;
-- Scheduler runs as the installing database administrator, never as a public API caller.
SELECT cron.schedule('cmo-daily-verified-backup','0 1 * * *','SELECT cmo.create_workspace_backup()');

CREATE OR REPLACE FUNCTION api.cmo_backup_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF cmo.actor() IS NULL OR cmo.actor()->>'role'<>'owner' THEN RAISE EXCEPTION 'Лише для керівника' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('retention',30,'schedule','Щодня, 01:00 UTC','latest',(SELECT jsonb_build_object('id',id,'createdAt',created_at,'checksum',checksum,'verification',verification) FROM cmo.workspace_backups ORDER BY id DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION api.cmo_backup_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.cmo_backup_status() TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION api.cmo_backup_status(body jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT api.cmo_backup_status() $$;
REVOKE ALL ON FUNCTION api.cmo_backup_status(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.cmo_backup_status(jsonb) TO authenticated;
