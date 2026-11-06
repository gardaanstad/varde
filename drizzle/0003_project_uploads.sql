CREATE TABLE `upload` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`data` blob NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- Real projects stop using the bundled stock photos: covers fall back to the
-- category placeholder and stock pictures leave update galleries. Example
-- (seed and sample) projects keep theirs.
UPDATE project SET data = json_set(data, '$.image', '') WHERE coalesce(json_extract(data, '$.example'), 0) = 0 AND json_extract(data, '$.image') LIKE '/images/%';
--> statement-breakpoint
UPDATE project SET data = json_set(data, '$.updates', (
  SELECT json_group_array(
    CASE WHEN json_type(u.value, '$.images') = 'array'
      THEN json_set(u.value, '$.images', (
        SELECT json_group_array(json(i.value))
        FROM json_each(u.value, '$.images') AS i
        WHERE json_extract(i.value, '$.src') NOT LIKE '/images/%'
      ))
      ELSE json(u.value)
    END
  )
  FROM json_each(data, '$.updates') AS u
)) WHERE coalesce(json_extract(data, '$.example'), 0) = 0 AND json_type(data, '$.updates') = 'array';
