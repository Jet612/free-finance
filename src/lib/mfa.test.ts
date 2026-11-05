import assert from "node:assert/strict";
import test from "node:test";

import { requiresMfaChallenge } from "./mfa";

const verified = [{ status: "verified" }];

test("a verified factor needs a code until the session reaches aal2", () => {
  assert.equal(requiresMfaChallenge(verified, "aal1"), true);
  assert.equal(requiresMfaChallenge(verified, null), true);
  assert.equal(requiresMfaChallenge(verified, "aal2"), false);
});

test("no enrollment means no challenge", () => {
  assert.equal(requiresMfaChallenge([], "aal1"), false);
  assert.equal(requiresMfaChallenge(undefined, "aal1"), false);
});

test("an enrollment that was never finished doesn't count", () => {
  assert.equal(requiresMfaChallenge([{ status: "unverified" }], "aal1"), false);
});
