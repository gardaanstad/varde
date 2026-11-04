-- Government buildings get their own category now that the register covers
-- infrastructure and public buildings, not only urban development.
UPDATE project SET data = json_set(data, '$.category', 'Offentlige bygg') WHERE id = 'regjeringskvartalet' AND json_extract(data, '$.category') = 'Næring';
