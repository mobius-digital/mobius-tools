import { test } from "node:test";
import assert from "node:assert/strict";

import { normaliseEmails, parseBoards, visibleTo, type BoardLink } from "../lib/boardLinks.ts";

function board(overrides: Partial<BoardLink>): BoardLink {
  return { label: "Lucky Golf", url: "https://lucky.example.com/", emails: [], ...overrides };
}

test("parseBoards survives junk and keeps only well-formed entries", () => {
  assert.deepEqual(parseBoards(null), []);
  assert.deepEqual(parseBoards("not json"), []);
  assert.deepEqual(parseBoards('{"a":1}'), []);

  const mixed = JSON.stringify([
    { label: "Lucky Golf", url: "https://lucky.example.com/", emails: [] },
    { label: "", url: "https://x.example.com/", emails: [] },
    { label: "No url", emails: [] },
    { label: "Bad emails", url: "https://y.example.com/", emails: "cole" },
  ]);
  assert.deepEqual(parseBoards(mixed), [
    { label: "Lucky Golf", url: "https://lucky.example.com/", emails: [] },
  ]);
});

test("an unrestricted entry shows to everyone, a restricted one only to its people", () => {
  const boards = [
    board({ label: "Open" }),
    board({ label: "Agency", url: "https://two.example.com/", emails: ["cole@agency.com"] }),
  ];

  // A password session has no verified email.
  assert.deepEqual(visibleTo(boards, null).map((b) => b.label), ["Open"]);
  // A client team member sees only the open entry.
  assert.deepEqual(visibleTo(boards, "kim@client.com").map((b) => b.label), ["Open"]);
  // The agency email sees both; case and whitespace do not matter.
  assert.deepEqual(visibleTo(boards, "  Cole@Agency.com ").map((b) => b.label), [
    "Open",
    "Agency",
  ]);
});

test("normaliseEmails takes a pasted list and refuses non-addresses", () => {
  assert.deepEqual(normaliseEmails(undefined), []);
  assert.deepEqual(normaliseEmails(""), []);
  assert.deepEqual(normaliseEmails("Cole@Agency.com,  cole@agency.com\nkim@x.co;"), [
    "cole@agency.com",
    "kim@x.co",
  ]);
  assert.equal(normaliseEmails("not-an-email"), false);
  assert.equal(normaliseEmails("a@b.com, nope"), false);
});
