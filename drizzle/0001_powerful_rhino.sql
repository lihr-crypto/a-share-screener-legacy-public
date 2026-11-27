CREATE TABLE `update_control` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`bootstrap_next_at` integer DEFAULT 0 NOT NULL,
	`bootstrap_last_attempt` integer,
	`bootstrap_error` text
);
