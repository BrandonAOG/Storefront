/** Known-size objects offered as one-click references in the measuring tool. You edit the list in Settings. */
export type RefPreset = { label: string; w: number; h: number | null; approx: boolean };

export const DEFAULT_REFS = [
  "Letter paper | 8.5 x 11",
  "AOG measuring sheet, marker frame | 6.5 x 9",
  "Outlet or switch cover plate | 2.75 x 4.5",
  "Credit card | 3.37 x 2.125",
  "Dollar bill | 6.14 x 2.61",
  "Standard brick face | 7.625 x 2.25",
  "Concrete block face | 15.625 x 7.625",
  "Standard door | 36 x 80",
  "~Electric meter cover, across | 6.375",
  "~Indoor panel cover, width | 14.5",
].join("\n");

/**
 * One per line: "Name | width x height" for a rectangle, or "Name | length"
 * for a single known length. Sizes are inches. Start a line with ~ to mark it
 * approximate; results measured from it are labelled as approximate.
 */
export function parseRefs(text: string): RefPreset[] {
  const out: RefPreset[] = [];
  for (const raw of text.split(/\r?\n/).slice(0, 60)) {
    const m = raw.match(/^\s*(~?)\s*(.+?)\s*\|\s*([\d.]+)\s*(?:"|in)?\s*(?:[x×]\s*([\d.]+)\s*(?:"|in)?)?\s*$/i);
    if (!m) continue;
    const w = Number.parseFloat(m[3]);
    const h = m[4] ? Number.parseFloat(m[4]) : null;
    if (!(w > 0 && w < 10000) || (h !== null && !(h > 0 && h < 10000))) continue;
    out.push({ label: m[2].slice(0, 80), w, h, approx: m[1] === "~" });
  }
  return out;
}
