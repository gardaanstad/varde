/**
 * Small text diffs for reviewing suggestions: paragraphs first, then words
 * within changed paragraphs. Longest-common-subsequence over tokens, with
 * the shared start and end trimmed first, so typical edits stay cheap.
 */
export type DiffPart = { type: "same" | "add" | "remove"; text: string };
export type ParagraphDiff =
  | { type: "same"; text: string }
  | { type: "change"; parts: DiffPart[] };

/** Above this many token pairs, a change is shown as replaced wholesale. */
const maxCells = 4_000_000;

type Op<T> = { type: DiffPart["type"]; item: T };

/** The edit script turning `a` into `b`, in order. */
export function diffSequences<T>(a: T[], b: T[]): Op<T>[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start])
    start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((item) => ({ type: "same" as const, item }));
  const tail = a.slice(endA).map((item) => ({ type: "same" as const, item }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const middle: Op<T>[] = [];
  if (n * m > maxCells || !n || !m) {
    for (const item of midA) middle.push({ type: "remove", item });
    for (const item of midB) middle.push({ type: "add", item });
    return [...head, ...middle, ...tail];
  }
  // lengths[i][j]: LCS of midA[i..] and midB[j..], one flat row-major table.
  const width = m + 1;
  const lengths = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lengths[i * width + j] =
        midA[i] === midB[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      middle.push({ type: "same", item: midA[i] });
      i++;
      j++;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])
      middle.push({ type: "remove", item: midA[i++] });
    else middle.push({ type: "add", item: midB[j++] });
  }
  while (i < n) middle.push({ type: "remove", item: midA[i++] });
  while (j < m) middle.push({ type: "add", item: midB[j++] });
  return [...head, ...middle, ...tail];
}

/** Joins neighbouring parts of the same type. */
function coalesce(parts: DiffPart[]) {
  const out: DiffPart[] = [];
  for (const part of parts) {
    if (!part.text) continue;
    const last = out.at(-1);
    if (last?.type === part.type) last.text += part.text;
    else out.push({ ...part });
  }
  return out;
}

/**
 * Word-level diff. Whitespace is kept, and lone spaces between two changes
 * join them, so "a b c" → "x y z" reads as one replacement, not three.
 */
export function diffWords(a: string, b: string): DiffPart[] {
  const tokens = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];
  const ops = diffSequences(tokens(a), tokens(b));
  const parts: DiffPart[] = ops.map(({ type, item }) => ({ type, text: item }));
  for (let k = 1; k < parts.length - 1; k++) {
    const part = parts[k];
    if (
      part.type === "same" &&
      /^\s+$/.test(part.text) &&
      parts[k - 1].type !== "same" &&
      parts[k + 1].type !== "same"
    )
      parts.splice(
        k,
        1,
        { type: "remove", text: part.text },
        { type: "add", text: part.text },
      );
  }
  // Removals read before additions within each changed stretch.
  const ordered: DiffPart[] = [];
  let removed = "";
  let added = "";
  const flush = () => {
    if (removed) ordered.push({ type: "remove", text: removed });
    if (added) ordered.push({ type: "add", text: added });
    removed = added = "";
  };
  for (const part of parts) {
    if (part.type === "remove") removed += part.text;
    else if (part.type === "add") added += part.text;
    else {
      flush();
      ordered.push(part);
    }
  }
  flush();
  return coalesce(ordered);
}

export function paragraphs(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * Paragraph-level diff: unchanged paragraphs whole, changed ones as word
 * diffs. A removed paragraph next to an added one is diffed as an edit.
 */
export function diffParagraphs(a: string, b: string): ParagraphDiff[] {
  const out: ParagraphDiff[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++)
      out.push({ type: "change", parts: diffWords(removed[k], added[k]) });
    for (const text of removed.slice(pairs))
      out.push({ type: "change", parts: [{ type: "remove", text }] });
    for (const text of added.slice(pairs))
      out.push({ type: "change", parts: [{ type: "add", text }] });
    removed = [];
    added = [];
  };
  for (const { type, item } of diffSequences(paragraphs(a), paragraphs(b))) {
    if (type === "remove") removed.push(item);
    else if (type === "add") added.push(item);
    else {
      flush();
      out.push({ type: "same", text: item });
    }
  }
  flush();
  return out;
}

type Shape = { geometry: [number, number][]; geometryType: "area" | "line" };

/** Great-circle distance in metres. */
export function distance(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

const centre = (points: [number, number][]) =>
  [
    points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length,
  ] as [number, number];

/** How a drawing changed: kind, point counts, and how far its centre moved. */
export function geometryChange(before: Shape, after: Shape) {
  return {
    type: [before.geometryType, after.geometryType] as const,
    points: [before.geometry.length, after.geometry.length] as const,
    moved: Math.round(distance(centre(before.geometry), centre(after.geometry))),
  };
}

/** "120 m" or "2,4 km". */
export function formatDistance(metres: number) {
  return metres < 1000
    ? `${Math.round(metres / 10) * 10} m`
    : `${(metres / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * Both drawings projected into one SVG viewBox (equirectangular around
 * their shared middle), so an overlay shows them at the same scale.
 */
export function overlayPaths(
  shapes: Shape[],
  width: number,
  height: number,
  padding = 12,
) {
  const all = shapes.flatMap((shape) => shape.geometry);
  const k = Math.cos((centre(all)[0] * Math.PI) / 180);
  const xy = ([lat, lng]: [number, number]) => [lng * k, -lat];
  const projected = all.map(xy);
  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = Math.min(
    (width - 2 * padding) / (maxX - minX || 1e-9),
    (height - 2 * padding) / (maxY - minY || 1e-9),
  );
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  return shapes.map((shape) => {
    const points = shape.geometry.map((point) => {
      const [x, y] = xy(point);
      return `${((x - minX) * scale + offsetX).toFixed(1)},${((y - minY) * scale + offsetY).toFixed(1)}`;
    });
    return `M${points.join("L")}${shape.geometryType === "area" ? "Z" : ""}`;
  });
}
