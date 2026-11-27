import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const marketRuns = sqliteTable("market_runs", {
  id: text("id").primaryKey(),
  marketDate: text("market_date").notNull(),
  updatedAt: text("updated_at").notNull(),
  weekStart: text("week_start").notNull(),
  monthTarget: text("month_target").notNull(),
  szseStatus: text("szse_status").notNull(),
  sseStatus: text("sse_status").notNull(),
  active: integer("active").notNull().default(0),
});

export const marketStocks = sqliteTable("market_stocks", {
  runId: text("run_id").notNull(),
  exchange: text("exchange").notNull(),
  board: text("board").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
}, t => [uniqueIndex("market_stocks_run_symbol").on(t.runId, t.exchange, t.code)]);

export const dailyPrices = sqliteTable("daily_prices", {
  runId: text("run_id").notNull(),
  exchange: text("exchange").notNull(),
  code: text("code").notNull(),
  tradeDate: text("trade_date").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),
  prevClose: real("prev_close"),
  limitExempt: integer("limit_exempt").notNull().default(0),
}, t => [uniqueIndex("daily_prices_run_symbol_date").on(t.runId, t.exchange, t.code, t.tradeDate)]);

export const screenRows = sqliteTable("screen_rows", {
  runId: text("run_id").notNull(),
  exchange: text("exchange").notNull(),
  board: text("board").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  close: real("close").notNull(),
  monthChange: real("month_change"),
  weekChange: real("week_change"),
  monthBaseDate: text("month_base_date"),
  weekBaseDate: text("week_base_date"),
  sufficient: integer("sufficient").notNull(),
  matched: integer("matched").notNull(),
  limitUpCount: integer("limit_up_count"),
  pullbackPercent: real("pullback_percent"),
}, t => [index("screen_rows_run_board_match").on(t.runId, t.board, t.matched)]);

export const updateControl = sqliteTable("update_control", {
  id: text("id").primaryKey(),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until").notNull().default(0),
  bootstrapNextAt: integer("bootstrap_next_at").notNull().default(0),
  bootstrapLastAttempt: integer("bootstrap_last_attempt"),
  bootstrapError: text("bootstrap_error"),
});
