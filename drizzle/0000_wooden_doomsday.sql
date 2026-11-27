CREATE TABLE `daily_prices` (
	`run_id` text NOT NULL,
	`exchange` text NOT NULL,
	`code` text NOT NULL,
	`trade_date` text NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_prices_run_symbol_date` ON `daily_prices` (`run_id`,`exchange`,`code`,`trade_date`);--> statement-breakpoint
CREATE TABLE `market_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`market_date` text NOT NULL,
	`updated_at` text NOT NULL,
	`week_start` text NOT NULL,
	`month_target` text NOT NULL,
	`szse_status` text NOT NULL,
	`sse_status` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_stocks` (
	`run_id` text NOT NULL,
	`exchange` text NOT NULL,
	`board` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_stocks_run_symbol` ON `market_stocks` (`run_id`,`exchange`,`code`);--> statement-breakpoint
CREATE TABLE `screen_rows` (
	`run_id` text NOT NULL,
	`exchange` text NOT NULL,
	`board` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`close` real NOT NULL,
	`month_change` real,
	`week_change` real,
	`month_base_date` text,
	`week_base_date` text,
	`sufficient` integer NOT NULL,
	`matched` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `screen_rows_run_board_match` ON `screen_rows` (`run_id`,`board`,`matched`);