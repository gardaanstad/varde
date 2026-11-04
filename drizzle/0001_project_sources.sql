-- Add verified project references to the existing illustrative entries.
-- json_insert leaves any existing website untouched.
UPDATE project SET data = json_insert(data, '$.website', 'https://osu.no/prosjekter', '$.example', json('true')) WHERE id = 'bispevika-sor';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.statsbygg.no/byggeprosjekter/nytt-regjeringskvartal/', '$.example', json('true')) WHERE id = 'regjeringskvartalet';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://haveiendom.no/gronlikaia/', '$.example', json('true')) WHERE id = 'gronlikaia';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.oslo.kommune.no/slik-bygger-vi-oslo/middelalderbyen', '$.example', json('true')) WHERE id = 'middelalderparken';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.oslohorisont.no/', '$.example', json('true')) WHERE id = 'oslo-horisont';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.oslo.kommune.no/etater-foretak-og-ombud/filipstad-infrastruktur', '$.example', json('true')) WHERE id = 'filipstad';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.landskaperiet.no/prosjekter/tullinkvartalet', '$.example', json('true')) WHERE id = 'tullinkvartalet';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://magasin.oslo.kommune.no/byplan/stor-forandring-i-nye-storgata', '$.example', json('true')) WHERE id = 'storgata';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.oslo.kommune.no/slik-bygger-vi-oslo/ensjobyen', '$.example', json('true')) WHERE id = 'ensjo';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.oslo.kommune.no/kunngjoringer/horing-av-arbeid-med-forvaltningsplan-for-akerselva-miljopark/', '$.example', json('true')) WHERE id = 'akerselva';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.oslo.kommune.no/slik-bygger-vi-oslo/fjordbyen-vest/skoyen', '$.example', json('true')) WHERE id = 'skoyen';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.dokken.no/', '$.example', json('true')) WHERE id = 'dokkeomradet';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.bergen.kommune.no/hvaskjer/tema/reguleringsplaner-for-bybanen', '$.example', json('true')) WHERE id = 'bybanen';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://trondheim.kommune.no/tema/bygg-kart-og-eiendom/arealplaner/kommuneplanens-arealdeldelplaner/kommunedelplan-nyhavna-k20110005/', '$.example', json('true')) WHERE id = 'nyhavna';
--> statement-breakpoint
UPDATE project SET data = json_insert(data, '$.website', 'https://www.stavanger.kommune.no/paradis', '$.example', json('true')) WHERE id = 'paradis';
