-- A project holds several categories: main categories, each optionally
-- narrowed to subcategories. Housing, business and public space become
-- subcategories of Byutvikling.
UPDATE project SET data = json_remove(json_set(data, '$.categories', CASE WHEN json_extract(data, '$.category') IN ('Bolig', 'Næring', 'Byrom og park') THEN json_array('Byutvikling', json_extract(data, '$.category')) ELSE json_array(json_extract(data, '$.category')) END), '$.category') WHERE json_type(data, '$.category') = 'text';
--> statement-breakpoint
UPDATE suggestion SET data = json_remove(json_set(data, '$.project.categories', CASE WHEN json_extract(data, '$.project.category') IN ('Bolig', 'Næring', 'Byrom og park') THEN json_array('Byutvikling', json_extract(data, '$.project.category')) ELSE json_array(json_extract(data, '$.project.category')) END), '$.project.category') WHERE json_type(data, '$.project.category') = 'text';
--> statement-breakpoint
UPDATE suggestion SET data = json_remove(json_set(data, '$.changes.categories', CASE WHEN json_extract(data, '$.changes.category') IN ('Bolig', 'Næring', 'Byrom og park') THEN json_array('Byutvikling', json_extract(data, '$.changes.category')) ELSE json_array(json_extract(data, '$.changes.category')) END), '$.changes.category') WHERE json_type(data, '$.changes.category') = 'text';
--> statement-breakpoint
UPDATE suggestion SET data = json_remove(json_set(data, '$.base.categories', CASE WHEN json_extract(data, '$.base.category') IN ('Bolig', 'Næring', 'Byrom og park') THEN json_array('Byutvikling', json_extract(data, '$.base.category')) ELSE json_array(json_extract(data, '$.base.category')) END), '$.base.category') WHERE json_type(data, '$.base.category') = 'text';
--> statement-breakpoint
UPDATE suggestion SET data = json_set(data, '$.applied', (
  SELECT json_group_array(CASE WHEN value = 'category' THEN 'categories' ELSE value END)
  FROM json_each(data, '$.applied')
)) WHERE json_type(data, '$.applied') = 'array';
--> statement-breakpoint
-- Example projects get subcategories of their own.
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Bolig", "Byrom og park"]')) WHERE id = 'bispevika-sor' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Offentlige bygg", "Forvaltning"]')) WHERE id = 'regjeringskvartalet' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Jernbane"]')) WHERE id = 'follobanen' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Kollektiv"]')) WHERE id = 'fornebubanen' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Vann og avløp", "Drikkevann"]')) WHERE id = 'vannforsyning-oslo' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Offentlige bygg", "Helse"]')) WHERE id = 'nye-aker' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Vei"]')) WHERE id = 'rogfast' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Vei"]')) WHERE id = 'sotrasambandet' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Energi", "CO₂-lagring"]')) WHERE id = 'northern-lights' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Vei"]')) WHERE id = 'halogalandsbrua' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Bolig"]')) WHERE id = 'gronlikaia' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Byrom og park"]')) WHERE id = 'middelalderparken' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Næring"]')) WHERE id = 'oslo-horisont' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling"]')) WHERE id = 'filipstad' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Næring"]')) WHERE id = 'tullinkvartalet' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Sykkel og gange", "Byutvikling", "Byrom og park"]')) WHERE id = 'storgata' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Bolig"]')) WHERE id = 'ensjo' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Byrom og park"]')) WHERE id = 'akerselva' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Jernbane", "Byutvikling", "Bolig"]')) WHERE id = 'skoyen' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling"]')) WHERE id = 'dokkeomradet' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Kollektiv"]')) WHERE id = 'bybanen' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling"]')) WHERE id = 'nyhavna' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Bolig"]')) WHERE id = 'paradis' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Kollektiv"]')) WHERE id = 'sample-bybane-asane' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling"]')) WHERE id = 'sample-tromso-sentrum' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Energi", "Strømnett"]')) WHERE id = 'sample-kraftlinje-sogn' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Offentlige bygg", "Skole", "Kultur og idrett"]')) WHERE id = 'sample-lade-skole' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Vann og avløp", "Avløp"]')) WHERE id = 'sample-avlop-stavanger' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Byrom og park"]')) WHERE id = 'sample-havnepark-kristiansand' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Samferdsel", "Sykkel og gange"]')) WHERE id = 'sample-sykkelvei-ring2' AND coalesce(json_extract(data, '$.example'), 0) = 1;
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.categories', json('["Byutvikling", "Bolig"]')) WHERE id = 'sample-bodo-boliger' AND coalesce(json_extract(data, '$.example'), 0) = 1;
