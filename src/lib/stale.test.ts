import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { staleSentence } from "./stale";

describe("staleSentence", () => {
  it("names the institution and the date", () => {
    assert.equal(
      staleSentence([{ institution: "Summit Credit", lastSuccessAt: "2026-10-30T07:00:00Z" }]),
      "Summit Credit hasn't updated since Oct 30, so spending after that is missing.",
    );
  });

  it("uses the oldest date when several are stale", () => {
    assert.equal(
      staleSentence([
        { institution: "Newer", lastSuccessAt: "2026-11-02T07:00:00Z" },
        { institution: "Older", lastSuccessAt: "2026-10-01T07:00:00Z" },
      ]),
      "Older and Newer haven't updated since Oct 1, so spending after that is missing.",
    );
  });

  it("doesn't invent a date it doesn't have", () => {
    assert.equal(
      staleSentence([{ institution: "New Bank", lastSuccessAt: null }]),
      "New Bank isn't updating, so some spending is missing.",
    );
  });
});
