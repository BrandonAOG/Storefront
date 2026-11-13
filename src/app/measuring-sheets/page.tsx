import { AR } from "@/lib/vendor/aruco";
import { PrintButton } from "@/components/PrintButton";
import { SHEET, SHEETS, markerIds } from "@/lib/sheets";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Measuring sheets", robots: { index: false } };

// The marker drawing includes a white rim one-tenth of its width; the black square is the middle 80%.
const DRAWN = SHEET.markerIn / 0.8;
const RIM = (DRAWN - SHEET.markerIn) / 2;
const inch = (n: number) => `${n}in`;

/** Three printable pages. Taped up before a video call, they let us measure from snapshots without any clicking. */
export default async function MeasuringSheets() {
  const s = await getSettings();
  const dict = new AR.Dictionary(SHEET.dictionary);
  // Top-left, top-right, bottom-right, bottom-left.
  const spots = [
    { left: SHEET.leftIn, top: SHEET.topIn },
    { left: SHEET.leftIn + SHEET.widthIn - SHEET.markerIn, top: SHEET.topIn },
    { left: SHEET.leftIn + SHEET.widthIn - SHEET.markerIn, top: SHEET.topIn + SHEET.heightIn - SHEET.markerIn },
    { left: SHEET.leftIn, top: SHEET.topIn + SHEET.heightIn - SHEET.markerIn },
  ];
  return (
    <div className="bg-slate-200 print:bg-white">
      <style>{`@page { size: letter; margin: 0; } @media print { html, body { background: #fff !important; } .no-print { display: none !important; } .sheet { margin: 0 !important; box-shadow: none !important; break-after: page; } }`}</style>
      <div className="no-print mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Measuring sheets for your video call</h1>
        <p className="mt-2 text-slate-700">Print these three pages and tape them up before your call. They let {s.businessName} measure your site accurately from the video, so we can often skip a separate site visit.</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-slate-700">
          <li><strong>Print at 100%.</strong> In the print window choose &quot;Actual size&quot; or 100% scale, not &quot;Fit to page&quot;. Black and white is fine.</li>
          <li><strong>Check the size.</strong> The bar on each page should measure exactly {SHEET.checkIn} inches. If it doesn&apos;t, tell us what it measures.</li>
          <li><strong>Tape each page flat</strong> where it says, with all four corners down. Keep the paper flat and uncreased.</li>
        </ol>
        <p className="mt-3 text-sm text-slate-600">No printer? No problem. A plain sheet of printer paper taped flat works too; we&apos;ll mark it by hand.</p>
        <div className="mt-5"><PrintButton>Print the 3 sheets</PrintButton></div>
      </div>

      {SHEETS.map((sheet) => (
        <section key={sheet.n} className="sheet relative mx-auto mb-8 overflow-hidden bg-white text-black shadow-lg" style={{ width: inch(8.5), height: inch(11) }} aria-label={`Sheet ${sheet.n}: ${sheet.name}`}>
          {markerIds(sheet.n).map((id, i) => (
            <div
              key={id}
              className="absolute [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              style={{ left: inch(spots[i].left - RIM), top: inch(spots[i].top - RIM), width: inch(DRAWN), height: inch(DRAWN) }}
              // Drawn by the marker library from a fixed pattern list; no outside input.
              dangerouslySetInnerHTML={{ __html: dict.generateSVG(id) }}
            />
          ))}

          <div className="absolute text-center" style={{ left: inch(1.25), width: inch(6), top: inch(3.1) }}>
            <p style={{ fontSize: "13pt", fontWeight: 800, letterSpacing: "0.08em" }}>{s.businessName.toUpperCase()}</p>
            <p style={{ fontSize: "11pt", marginTop: "0.05in" }}>Measuring sheet {sheet.n} of {SHEETS.length}</p>
            <p style={{ fontSize: "40pt", fontWeight: 900, lineHeight: 1.05, marginTop: "0.3in" }}>{sheet.name}</p>
            <p style={{ fontSize: "16pt", fontWeight: 700, marginTop: "0.2in" }}>Tape this page {sheet.where}.</p>
            <p style={{ fontSize: "11pt", marginTop: "0.3in" }}>Tape all four corners flat. Keep the whole page in view when we ask you to show this area. Don&apos;t fold or crease it.</p>
          </div>

          {/* Check bar: proves the page was printed at full size. */}
          <div className="absolute" style={{ left: inch(4.25 - SHEET.checkIn / 2), width: inch(SHEET.checkIn), top: inch(7.35) }}>
            <div style={{ height: "0.3in", borderLeft: "0.03in solid #000", borderRight: "0.03in solid #000", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: "0.135in", height: "0.03in", background: "#000" }} />
            </div>
            <p className="text-center" style={{ fontSize: "10pt", marginTop: "0.06in" }}>This bar should measure exactly {SHEET.checkIn} inches, end to end. If it doesn&apos;t, reprint at 100% or tell us what it measures.</p>
          </div>
          {s.phone && <p className="absolute text-center" style={{ left: inch(2.75), width: inch(3), top: inch(9.35), fontSize: "10pt" }}>{s.phone}</p>}
        </section>
      ))}
    </div>
  );
}
