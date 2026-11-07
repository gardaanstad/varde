ALTER TABLE `bookmark` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `bookmark_project_idx` ON `bookmark` (`project_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `feed_seen_at` integer;--> statement-breakpoint
CREATE INDEX `comment_parent_idx` ON `comment` (`parent_id`);--> statement-breakpoint
-- Existing follows and accounts start with nothing unread.
UPDATE `bookmark` SET `created_at` = cast(strftime('%s', 'now') as integer) * 1000;--> statement-breakpoint
UPDATE `user` SET `feed_seen_at` = cast(strftime('%s', 'now') as integer) * 1000;
