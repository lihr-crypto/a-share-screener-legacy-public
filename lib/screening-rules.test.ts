import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTenSessions, officialLimitUpPrice, type SessionBar } from "./screening-rules.ts";

function series(limitUps: number[], latestClose = 110.01, peak = 120) {
  return Array.from({ length: 10 }, (_, i): SessionBar => ({
    date: `202609${String(i + 1).padStart(2, "0")}`,
    high: i === 2 ? peak : 111,
    close: limitUps.includes(i) ? 120 : i === 9 ? latestClose : 110,
    prevClose: limitUps.includes(i) ? 100 : 110,
  }));
}

test("counts only 1 through 3 limit-up closes", () => {
  assert.equal(evaluateTenSessions(series([0])).matched, true);
  assert.equal(evaluateTenSessions(series([0, 1, 4])).matched, true);
  assert.equal(evaluateTenSessions(series([])).matched, false);
  assert.equal(evaluateTenSessions(series([0, 1, 2, 4])).matched, false);
});

test("accepts exactly 10 percent below the ten-session high and rejects more", () => {
  assert.equal(evaluateTenSessions(series([0], 108, 120)).pullbackPercent, 10);
  assert.equal(evaluateTenSessions(series([0], 108, 120)).matched, true);
  assert.ok(evaluateTenSessions(series([0], 107.99, 120)).pullbackPercent! > 10);
  assert.equal(evaluateTenSessions(series([0], 107.99, 120)).matched, false);
});

test("excludes the first five no-limit IPO sessions and requires ten sessions", () => {
  const ipo = series([0, 1, 2, 3, 4]);
  for (let i = 0; i < 5; i++) ipo[i].limitExempt = true;
  assert.equal(evaluateTenSessions(ipo).limitUpCount, 0);
  assert.equal(evaluateTenSessions(ipo).matched, false);
  assert.equal(evaluateTenSessions(ipo.slice(0, 9)).sufficient, false);
  assert.equal(evaluateTenSessions(ipo.slice(0, 9)).limitUpCount, null);
});

test("uses cent-rounded 20 percent limit prices", () => {
  assert.equal(officialLimitUpPrice(10.03), 12.04);
  assert.equal(officialLimitUpPrice(0), null);
});
