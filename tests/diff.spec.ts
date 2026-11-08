import { expect, test } from "@playwright/test";
import {
  diffParagraphs,
  diffSequences,
  diffStats,
  diffWords,
  type DiffPart,
} from "../app/lib/diff";

/** Both sides of a diff, rebuilt from its parts. */
function sides(parts: DiffPart[]) {
  return {
    before: parts.filter((p) => p.type !== "add").map((p) => p.text).join(""),
    after: parts.filter((p) => p.type !== "remove").map((p) => p.text).join(""),
  };
}

test("sequences: a minimal edit script", () => {
  const ops = diffSequences([..."abcde"], [..."abxde"]);
  expect(ops.map((op) => `${op.type[0]}${op.item}`).join(" ")).toBe(
    "sa sb rc ax sd se",
  );
  expect(diffSequences([], [])).toEqual([]);
  expect(diffSequences([], ["a"])).toEqual([{ type: "add", item: "a" }]);
  expect(diffSequences(["a"], [])).toEqual([{ type: "remove", item: "a" }]);
});

test("words: an added sentence is the only change", () => {
  const parts = diffWords(
    "Banen åpner i 2027.",
    "Banen åpner i 2027. Prøvedrift starter i høst.",
  );
  expect(parts).toEqual([
    { type: "same", text: "Banen åpner i 2027." },
    { type: "add", text: " Prøvedrift starter i høst." },
  ]);
});

test("words: a replaced word, and replaced runs read as one change", () => {
  expect(diffWords("Ferdig i 2027", "Ferdig i 2028")).toEqual([
    { type: "same", text: "Ferdig i " },
    { type: "remove", text: "2027" },
    { type: "add", text: "2028" },
  ]);
  expect(diffWords("en to tre fire", "en fem seks fire")).toEqual([
    { type: "same", text: "en " },
    { type: "remove", text: "to tre" },
    { type: "add", text: "fem seks" },
    { type: "same", text: " fire" },
  ]);
});

test("words: both sides always rebuild exactly", () => {
  const cases = [
    ["", "Ny tekst"],
    ["Gammel tekst", ""],
    ["Samme", "Samme"],
    ["a  b\tc", "a b c d"],
    ["Bru over fjorden, 2 km.", "Bru og tunnel under fjorden, 2,4 km."],
  ];
  for (const [a, b] of cases) expect(sides(diffWords(a, b))).toEqual({
    before: a,
    after: b,
  });
});

test("paragraphs: unchanged paragraphs stay whole, edits are word diffs", () => {
  const before = "Første avsnitt.\n\nAndre avsnitt.\n\nTredje avsnitt.";
  const after =
    "Første avsnitt.\n\nAndre avsnitt, nå utvidet.\n\nTredje avsnitt.\n\nNytt avsnitt.";
  const diff = diffParagraphs(before, after);
  expect(diff.map((p) => p.type)).toEqual(["same", "change", "same", "change"]);
  expect(diff[1]).toEqual({
    type: "change",
    parts: [
      { type: "same", text: "Andre " },
      { type: "remove", text: "avsnitt." },
      { type: "add", text: "avsnitt, nå utvidet." },
    ],
  });
  expect(diff[3]).toEqual({
    type: "change",
    parts: [{ type: "add", text: "Nytt avsnitt." }],
  });
  expect(diffStats(diff)).toEqual({ added: 5, removed: 1 });
});

test("paragraphs: removed paragraphs and Windows line breaks", () => {
  const diff = diffParagraphs("En.\r\n\r\nTo.\r\n\r\nTre.", "En.\n\nTre.");
  expect(diff).toEqual([
    { type: "same", text: "En." },
    { type: "change", parts: [{ type: "remove", text: "To." }] },
    { type: "same", text: "Tre." },
  ]);
  expect(diffParagraphs("Lik.", "Lik.")).toEqual([{ type: "same", text: "Lik." }]);
});

test("large unrelated texts fall back to a wholesale replacement", () => {
  const a = Array.from({ length: 2500 }, (_, i) => `a${i}`).join(" ");
  const b = Array.from({ length: 2500 }, (_, i) => `b${i}`).join(" ");
  const started = Date.now();
  const parts = diffWords(a, b);
  expect(Date.now() - started).toBeLessThan(1000);
  expect(sides(parts)).toEqual({ before: a, after: b });
});

test("geometry: summary and a shared overlay frame", async () => {
  const { formatDistance, geometryChange, overlayPaths } = await import(
    "../app/lib/diff"
  );
  const before = {
    geometryType: "line" as const,
    geometry: [
      [59.91, 10.75],
      [59.92, 10.76],
    ] as [number, number][],
  };
  const after = {
    geometryType: "area" as const,
    geometry: [
      [59.91, 10.75],
      [59.92, 10.76],
      [59.91, 10.77],
    ] as [number, number][],
  };
  const change = geometryChange(before, after);
  expect(change.type).toEqual(["line", "area"]);
  expect(change.points).toEqual([2, 3]);
  expect(change.moved).toBeGreaterThan(300);
  expect(change.moved).toBeLessThan(500);
  expect(formatDistance(126)).toBe("130 m");
  expect(formatDistance(2440)).toBe("2,4 km");
  const [line, area] = overlayPaths([before, after], 320, 180);
  expect(line).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+$/);
  expect(area.endsWith("Z")).toBe(true);
  // Every point fits inside the frame.
  for (const n of `${line}${area}`.match(/[\d.]+/g)!.map(Number))
    expect(n).toBeLessThanOrEqual(320);
});
