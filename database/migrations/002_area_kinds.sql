ALTER TABLE areas DROP CONSTRAINT IF EXISTS areas_kind_check;
ALTER TABLE areas ADD CONSTRAINT areas_kind_check
  CHECK (kind IN ('country','region','city','neighborhood','hex'));
