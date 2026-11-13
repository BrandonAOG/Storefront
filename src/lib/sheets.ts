/**
 * The printable AOG measuring sheets.
 *
 * Each sheet has four square markers, one in each corner. The outside corners
 * of those markers form a rectangle of a known size, which the measuring tool
 * finds in a snapshot by itself and uses as its reference.
 *
 * All sizes are inches on US Letter paper printed at 100%.
 */
export const SHEET = {
  /** Outside corner to outside corner of the markers. */
  widthIn: 6.5,
  heightIn: 9,
  /** Side of one black marker square. */
  markerIn: 1.5,
  /** Where the reference rectangle starts on the page. */
  leftIn: 1,
  topIn: 1,
  /** The printed check bar. If it doesn't measure this, the page was shrunk when printing. */
  checkIn: 6,
  dictionary: "ARUCO_MIP_36h12",
} as const;

/** Where each sheet goes. A reference only works for the flat surface it is taped to, hence one per surface. */
export const SHEETS = [
  { n: 1, name: "Electrical panel", where: "on the wall right next to your electrical panel" },
  { n: 2, name: "Electric meter", where: "on the wall right next to your electric meter" },
  { n: 3, name: "Generator spot", where: "flat on the ground where the generator would sit" },
] as const;

/** Marker numbers for sheet n, in the order top-left, top-right, bottom-right, bottom-left. */
export const markerIds = (n: number) => [0, 1, 2, 3].map((i) => (n - 1) * 4 + i);
