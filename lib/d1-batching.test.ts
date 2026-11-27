import assert from "node:assert/strict";
import test from "node:test";
import { maxRowsPerInsert } from "./d1-batching.ts";

test("caps each prepared insert at 90 bound variables", () => {
  for (const [columns, expectedRows] of [[5, 18], [11, 8], [14, 6]]) {
    const rows = maxRowsPerInsert(columns, 100);
    assert.equal(rows, expectedRows);
    assert.ok(rows * columns <= 90);
  }
});

test("keeps a smaller requested row limit", () => {
  assert.equal(maxRowsPerInsert(5, 4), 4);
});
