import { test } from "node:test";
import assert from "node:assert/strict";

import { nameFromEmail } from "../lib/access.ts";

test("a work email becomes a readable name", () => {
  assert.equal(nameFromEmail("cole@go-mobius-digital.com"), "Cole");
  assert.equal(nameFromEmail("cole.wetzl@example.com"), "Cole Wetzl");
  assert.equal(nameFromEmail("dana_smith@example.com"), "Dana Smith");
  assert.equal(nameFromEmail("sam-jones@example.com"), "Sam Jones");
});

test("odd addresses still produce something usable", () => {
  assert.equal(nameFromEmail("r2d2@example.com"), "R2d2");
  assert.equal(nameFromEmail("no-at-sign"), "No At Sign");
  assert.equal(
    nameFromEmail("...@example.com"),
    "...@example.com",
    "falls back to the address rather than an empty name",
  );
});
