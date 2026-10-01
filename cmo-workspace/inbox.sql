CREATE TABLE IF NOT EXISTS cmo.inbox_preferences(
 actor_id uuid NOT NULL, task_id text NOT NULL, read_version integer,
 snooze_version integer, snooze_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,task_id)
);
ALTER TABLE cmo.inbox_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cmo.inbox_preferences FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION cmo.inbox_action(body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=cmo.actor();t cmo.tasks;op text:=body->>'op';uid uuid;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Немає доступу' USING ERRCODE='42501'; END IF;
 uid:=(a->>'id')::uuid;
 IF op='list' THEN RETURN (cmo.request('{"op":"list"}'))||jsonb_build_object('preferences',coalesce((SELECT jsonb_agg(jsonb_build_object('taskId',p.task_id,'readVersion',p.read_version,'snoozeVersion',p.snooze_version,'snoozeUntil',p.snooze_until)) FROM cmo.inbox_preferences p JOIN cmo.tasks visible_task ON visible_task.workspace_key='pavutyna-cmo' AND visible_task.source_id=p.task_id WHERE p.actor_id=uid AND (cmo.task_permissions(a,visible_task.runtime_payload)->>'visible')::boolean),'[]')); END IF;
 SELECT * INTO t FROM cmo.tasks WHERE workspace_key='pavutyna-cmo' AND source_id=body->>'id';
 IF NOT FOUND OR NOT (cmo.task_permissions(a,t.runtime_payload)->>'visible')::boolean THEN RAISE EXCEPTION 'Задача недоступна' USING ERRCODE='42501'; END IF;
 IF coalesce(body->>'version','')<>t.version::text THEN RAISE EXCEPTION 'Задачу змінено. Онови Inbox.' USING ERRCODE='40001'; END IF;
 IF op NOT IN ('read','unread','snooze','unsnooze') OR op IS NULL THEN RAISE EXCEPTION 'Невідома дія'; END IF;
 INSERT INTO cmo.inbox_preferences(actor_id,task_id) VALUES(uid,t.source_id) ON CONFLICT DO NOTHING;
 IF op IN ('read','unread') THEN UPDATE cmo.inbox_preferences SET read_version=CASE WHEN op='read' THEN t.version ELSE NULL END,updated_at=now() WHERE actor_id=uid AND task_id=t.source_id;
 ELSIF op='unsnooze' THEN UPDATE cmo.inbox_preferences SET snooze_version=NULL,snooze_until=NULL,updated_at=now() WHERE actor_id=uid AND task_id=t.source_id;
 ELSE
  IF coalesce((body->>'hours')::integer,0) NOT IN (1,24,168) THEN RAISE EXCEPTION 'Відкласти можна на годину, добу або тиждень'; END IF;
  UPDATE cmo.inbox_preferences SET snooze_version=t.version,snooze_until=now()+make_interval(hours=>(body->>'hours')::integer),updated_at=now() WHERE actor_id=uid AND task_id=t.source_id;
 END IF;
 RETURN jsonb_build_object('saved',true);
END $$;
REVOKE ALL ON FUNCTION cmo.inbox_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cmo.inbox_action(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION api.cmo_inbox_action(body jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT cmo.inbox_action(body) $$;
REVOKE ALL ON FUNCTION api.cmo_inbox_action(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.cmo_inbox_action(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
