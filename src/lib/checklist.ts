import type { Settings } from "@/db/schema";

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.replace(/^[-*•\s]+/, "").trim()).filter(Boolean).slice(0, 20);

/** What a customer should have ready for a video call. You edit both lists in Settings. */
export function callChecklist(s: Pick<Settings, "callNeeded" | "callRecommended">) {
  return { needed: lines(s.callNeeded), recommended: lines(s.callRecommended) };
}

/** The same lists as plain text, for emails. Empty when both lists are empty. */
export function callChecklistText(s: Pick<Settings, "callNeeded" | "callRecommended">): string {
  const { needed, recommended } = callChecklist(s);
  const block = (title: string, items: string[]) => (items.length ? `${title}\n${items.map((i) => `- ${i}`).join("\n")}` : "");
  return [block("Please have ready:", needed), block("Helpful if you have them (not required):", recommended)].filter(Boolean).join("\n\n");
}
