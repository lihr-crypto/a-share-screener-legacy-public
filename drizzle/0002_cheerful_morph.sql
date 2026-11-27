ALTER TABLE `daily_prices` ADD `prev_close` real;--> statement-breakpoint
ALTER TABLE `daily_prices` ADD `limit_exempt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `screen_rows` ADD `limit_up_count` integer;--> statement-breakpoint
ALTER TABLE `screen_rows` ADD `pullback_percent` real;