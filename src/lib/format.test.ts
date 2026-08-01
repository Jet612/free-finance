import assert from "node:assert/strict";
import test from "node:test";

import { formatRelativeTime } from "./format";

const now = new Date("2026-08-01T18:00:00.000Z");

test("recent timestamps use a short relative label", () => {
  assert.equal(
    formatRelativeTime("2026-08-01T17:59:30.000Z", now),
    "just now",
  );
  assert.equal(
    formatRelativeTime("2026-08-01T17:55:00.000Z", now),
    "5 minutes ago",
  );
  assert.equal(
    formatRelativeTime("2026-08-01T16:00:00.000Z", now),
    "2 hours ago",
  );
});

test("relative timestamps support days and future values", () => {
  assert.equal(
    formatRelativeTime("2026-07-29T18:00:00.000Z", now),
    "3 days ago",
  );
  assert.equal(
    formatRelativeTime("2026-08-04T18:00:00.000Z", now),
    "in 3 days",
  );
});
