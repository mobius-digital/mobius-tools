import { strict as assert } from "node:assert";
import test from "node:test";
import { nameFromEmail, normaliseEmail } from "../lib/identity.ts";

test("normaliseEmail accepts a real address and lowercases it", () => {
  assert.equal(normaliseEmail("  Cole@Go-Mobius-Digital.com "), "cole@go-mobius-digital.com");
});

test("normaliseEmail rejects things that are not addresses", () => {
  for (const junk of ["", "cole", "cole@", "@company.com", "cole@company", "a b@c.com", null, 42]) {
    assert.equal(normaliseEmail(junk), null, `should reject ${JSON.stringify(junk)}`);
  }
});

test("normaliseEmail rejects an absurdly long address", () => {
  assert.equal(normaliseEmail(`${"a".repeat(300)}@company.com`), null);
});

test("nameFromEmail builds a readable name from the local part", () => {
  assert.equal(nameFromEmail("cole.wetzl@example.com"), "Cole Wetzl");
  assert.equal(nameFromEmail("cole@example.com"), "Cole");
  assert.equal(nameFromEmail("first_last-name@example.com"), "First Last Name");
});
