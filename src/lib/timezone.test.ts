import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  appTimeZone,
  monthStartInAppTimezone,
  sameDayLastMonth,
  subtractDays,
  todayInAppTimezone,
} from "./timezone";

const original = process.env.APP_TIMEZONE;

afterEach(() => {
  process.env.APP_TIMEZONE = original;
});

test("falls back instead of crashing on an invalid time zone", () => {
  process.env.APP_TIMEZONE = "Mars/Olympus_Mons";
  assert.equal(appTimeZone(), "America/New_York");
});

test("today follows the configured zone, not UTC", () => {
  process.env.APP_TIMEZONE = "America/Los_Angeles";
  const lateEvening = new Date("2026-11-06T04:00:00Z");
  assert.equal(todayInAppTimezone(lateEvening), "2026-11-05");
  process.env.APP_TIMEZONE = "Asia/Tokyo";
  assert.equal(todayInAppTimezone(lateEvening), "2026-11-06");
});

test("month start follows the configured zone", () => {
  process.env.APP_TIMEZONE = "America/Los_Angeles";
  assert.equal(
    monthStartInAppTimezone(new Date("2026-12-01T04:00:00Z")),
    "2026-11-01",
  );
});

test("subtracts days across a month boundary", () => {
  assert.equal(subtractDays("2026-03-02", 3), "2026-02-27");
});

test("same day last month clamps to shorter months", () => {
  assert.equal(sameDayLastMonth("2026-11-05"), "2026-10-05");
  assert.equal(sameDayLastMonth("2026-03-31"), "2026-02-28");
  assert.equal(sameDayLastMonth("2024-03-31"), "2024-02-29");
  assert.equal(sameDayLastMonth("2026-01-15"), "2025-12-15");
});
