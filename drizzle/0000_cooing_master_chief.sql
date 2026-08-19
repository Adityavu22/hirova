CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text DEFAULT 'Applied' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`applied_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_applications_user_job` ON `applications` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `idx_applications_user_id` ON `applications` (`user_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`score` integer NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_resumes_user_id` ON `resumes` (`user_id`);--> statement-breakpoint
CREATE TABLE `saved_jobs` (
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `job_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_saved_jobs_user_id` ON `saved_jobs` (`user_id`);