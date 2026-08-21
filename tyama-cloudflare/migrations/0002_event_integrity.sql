CREATE TRIGGER response_answer_same_questionnaire
BEFORE INSERT ON response_answers
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
    FROM responses r
    JOIN questions q ON q.id = NEW.question_id
   WHERE r.id = NEW.response_id
     AND r.questionnaire_id = q.questionnaire_id
)
BEGIN
  SELECT RAISE(ABORT, 'response_answer_questionnaire_mismatch');
END;

CREATE TRIGGER kit_source_same_event_insert
BEFORE INSERT ON kit_items
FOR EACH ROW
WHEN NEW.source_response_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM responses r
    WHERE r.id = NEW.source_response_id
      AND r.event_id = NEW.event_id
 )
BEGIN
  SELECT RAISE(ABORT, 'kit_source_event_mismatch');
END;

CREATE TRIGGER kit_source_same_event_update
BEFORE UPDATE OF source_response_id, event_id ON kit_items
FOR EACH ROW
WHEN NEW.source_response_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM responses r
    WHERE r.id = NEW.source_response_id
      AND r.event_id = NEW.event_id
 )
BEGIN
  SELECT RAISE(ABORT, 'kit_source_event_mismatch');
END;

CREATE TRIGGER rehearsal_item_same_event
BEFORE INSERT ON rehearsal_items
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM kit_items k
   WHERE k.id = NEW.kit_item_id
     AND k.event_id = NEW.event_id
)
BEGIN
  SELECT RAISE(ABORT, 'rehearsal_event_mismatch');
END;

CREATE TRIGGER live_item_same_event_insert
BEFORE INSERT ON live_state
FOR EACH ROW
WHEN NEW.current_item_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM kit_items k
    WHERE k.id = NEW.current_item_id
      AND k.event_id = NEW.event_id
 )
BEGIN
  SELECT RAISE(ABORT, 'live_event_mismatch');
END;

CREATE TRIGGER live_item_same_event_update
BEFORE UPDATE OF current_item_id ON live_state
FOR EACH ROW
WHEN NEW.current_item_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM kit_items k
    WHERE k.id = NEW.current_item_id
      AND k.event_id = NEW.event_id
 )
BEGIN
  SELECT RAISE(ABORT, 'live_event_mismatch');
END;
