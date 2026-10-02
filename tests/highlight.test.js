import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizeForHighlight, highlightToHtml } from "../src/highlight.js";
import { defPrimitive } from "../src/types.js";

if (!(globalThis.__tortueHighlightTestPrimRegistered)) {
  defPrimitive("FORWARD", { kind: "expr", arity: 1, fn: (x) => x });
  globalThis.__tortueHighlightTestPrimRegistered = true;
}

test("tokenizeForHighlight reconstructs the exact source text", () => {
  const source = 'TO SQUARE :SIZE\n  REPEAT 4 [FORWARD :SIZE RIGHT 90]\nEND\n; a comment\n';
  const tokens = tokenizeForHighlight(source);
  assert.equal(tokens.map((t) => t.text).join(""), source);
});

test("tokenizeForHighlight classifies known categories", () => {
  const tokens = tokenizeForHighlight('FORWARD :SIZE "WORD [1 2] ; comment');
  const byText = Object.fromEntries(tokens.map((t) => [t.text, t.className]));
  assert.equal(byText["FORWARD"], "tortue-keyword");
  assert.equal(byText[":SIZE"], "tortue-variable");
  assert.equal(byText['"WORD'], "tortue-string");
  assert.equal(byText["["], "tortue-bracket");
  assert.equal(byText["1"], "tortue-number");
  assert.equal(byText["; comment"], "tortue-comment");
});

test("tokenizeForHighlight treats an unknown bare word as a plain word, not a keyword", () => {
  const tokens = tokenizeForHighlight("BLARGLE");
  assert.equal(tokens[0].className, "tortue-word");
});

test("highlightToHtml escapes HTML-significant characters", () => {
  const html = highlightToHtml('"A<B&C>');
  assert.ok(html.includes("&lt;"));
  assert.ok(html.includes("&amp;"));
  assert.ok(html.includes("&gt;"));
});

test("highlightToHtml wraps tokens in spans with the right classes", () => {
  const html = highlightToHtml("FORWARD 100");
  assert.ok(html.includes('<span class="tortue-keyword">FORWARD</span>'));
  assert.ok(html.includes('<span class="tortue-number">100</span>'));
});
