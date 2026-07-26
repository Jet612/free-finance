import assert from "node:assert/strict";
import test from "node:test";

import {
  safeMerchantWebsite,
  safePlaidLogoUrl,
  websiteHostname,
} from "./external-url";

test("merchant websites are normalized to HTTPS", () => {
  assert.equal(
    safeMerchantWebsite("example.com/account"),
    "https://example.com/account",
  );
  assert.equal(
    safeMerchantWebsite("https://www.example.com/"),
    "https://www.example.com/",
  );
});

test("merchant websites reject unsafe schemes and credentials", () => {
  assert.equal(safeMerchantWebsite("javascript:alert(1)"), null);
  assert.equal(safeMerchantWebsite("http://example.com"), null);
  assert.equal(safeMerchantWebsite("https://user:pass@example.com"), null);
  assert.equal(safeMerchantWebsite(""), null);
});

test("merchant logos are restricted to Plaid's CDN", () => {
  assert.equal(
    safePlaidLogoUrl(
      "https://plaid-merchant-logos.plaid.com/example-logo.png",
    ),
    "https://plaid-merchant-logos.plaid.com/example-logo.png",
  );
  assert.equal(safePlaidLogoUrl("https://example.com/logo.png"), null);
  assert.equal(safePlaidLogoUrl("data:image/png;base64,AAAA"), null);
});

test("website hostnames are human-readable", () => {
  assert.equal(websiteHostname("https://www.example.com/path"), "example.com");
});
