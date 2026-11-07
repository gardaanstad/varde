CREATE TABLE `suggestion` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`project_id` text,
	`user_id` text NOT NULL,
	`data` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewer_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `suggestion_status_idx` ON `suggestion` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `suggestion_user_idx` ON `suggestion` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `suggestion_project_idx` ON `suggestion` (`project_id`);--> statement-breakpoint
ALTER TABLE `upload` ADD `public` integer DEFAULT true NOT NULL;