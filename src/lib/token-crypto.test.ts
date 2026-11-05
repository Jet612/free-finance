import assert from "node:assert/strict";
import test from "node:test";

import { decryptToken, encryptToken, secretsMatch } from "./token-crypto";

const secret = "a-test-secret-that-is-long-enough-for-this";

test("round-trips a token", () => {
  const encrypted = encryptToken("access-sandbox-123", secret, "item-1");
  assert.equal(decryptToken(encrypted, secret, "item-1"), "access-sandbox-123");
  assert.doesNotMatch(encrypted, /access-sandbox-123/);
});

test("encrypting the same token twice gives different output", () => {
  assert.notEqual(
    encryptToken("same", secret, "item-1"),
    encryptToken("same", secret, "item-1"),
  );
});

test("refuses a token copied onto another row", () => {
  const encrypted = encryptToken("token", secret, "item-1");
  assert.throws(() => decryptToken(encrypted, secret, "item-2"));
});

test("refuses the wrong secret", () => {
  const encrypted = encryptToken("token", secret, "item-1");
  assert.throws(() => decryptToken(encrypted, `${secret}x`, "item-1"));
});

test("detects tampering", () => {
  const parts = encryptToken("token", secret, "item-1").split(".");
  const flipped = parts[3].startsWith("A") ? "B" : "A";
  parts[3] = `${flipped}${parts[3].slice(1)}`;
  assert.throws(() => decryptToken(parts.join("."), secret, "item-1"));
});

test("rejects an unknown format", () => {
  assert.throws(() => decryptToken("not-encrypted", secret, "item-1"));
});

test("secretsMatch needs both values and an exact match", () => {
  assert.equal(secretsMatch("abc", "abc"), true);
  assert.equal(secretsMatch("abc", "abd"), false);
  assert.equal(secretsMatch("abc", "abcd"), false);
  assert.equal(secretsMatch("", ""), false);
  assert.equal(secretsMatch(null, "abc"), false);
  assert.equal(secretsMatch("abc", null), false);
});
