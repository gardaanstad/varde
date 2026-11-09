ALTER TABLE `bookmark` ADD `following` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmark` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmark` ADD `seen_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `bookmark_project_idx` ON `bookmark` (`project_id`);--> statement-breakpoint
-- Existing saved projects become follows with nothing unread.
UPDATE `bookmark` SET `created_at` = cast(strftime('%s', 'now') as integer) * 1000, `seen_at` = cast(strftime('%s', 'now') as integer) * 1000;
