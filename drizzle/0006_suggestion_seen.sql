ALTER TABLE `suggestion` ADD `seen_at` integer;
--> statement-breakpoint
-- Reviews from before this column count as seen, so nobody gets a stale badge.
UPDATE `suggestion` SET `seen_at` = `reviewed_at` WHERE `reviewed_at` IS NOT NULL;
