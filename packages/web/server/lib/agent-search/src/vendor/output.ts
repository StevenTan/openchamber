import type { SearchResponse, SearchResult } from "./normalize.js";
import type { WebRunCommand } from "./commands.js";

export interface FormattedToolOutput {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

export function formatMarkdownLink(url: string, text: string): string {
  if (!url) return text;
  const destination = url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, encodeURIComponent);
  return `[${text.replace(/[[\]\\]/g, "\\$&")}](${destination})`;
}

export function cleanCitationMarkers(text: string, results: SearchResult[] = []): string {
  if (!text) return "";

  const refToEntryMap = new Map<string, { num: number; item: SearchResult }>();
  results.forEach((r, idx) => {
    const ref = r.ref_id;
    if (ref) {
      refToEntryMap.set(ref, { num: idx + 1, item: r });
    }
  });

  // 1. Matches Codex private Unicode citation markers: \uE200cite\uE202<ref>\uE201 or cite<ref>
  let cleaned = text.replace(/\uE200cite\uE202([^\uE201]+)\uE201/g, (_match: string, inner: string) => {
    const cleanInner = inner.trim();
    if (!cleanInner) return "";

    if (cleanInner.includes("†")) {
      const parts = cleanInner.split("†");
      const label = parts.slice(1).join("†").trim();
      return label ? `[${label}]` : "";
    }

    return cleanInner.split("\uE202").map(ref => {
      const entry = refToEntryMap.get(ref);
      if (!entry) return `[${ref}]`;
      const label = `[${entry.num}]`;
      return entry.item.url ? formatMarkdownLink(entry.item.url, label) : label;
    }).join(" ");
  });

  // 2. Converts raw turn references like [turn0search0, turn2view0] into Markdown link brackets [1] [2]
  cleaned = cleaned.replace(/\[(turn\d+[a-z0-9_,\s]*)\]/gi, (_match: string, inner: string) => {
    const refs = inner.split(",").map((s) => s.trim());
    const formattedRefs = refs.map((ref) => {
      if (refToEntryMap.has(ref)) {
        const entry = refToEntryMap.get(ref)!;
        const label = `[${entry.num}]`;
        return entry.item.url ? formatMarkdownLink(entry.item.url, label) : label;
      }
      return `[${ref}]`;
    });
    return formattedRefs.join(" ");
  });

  return cleaned;
}

export function formatWebToolResult(command: WebRunCommand, response: SearchResponse): FormattedToolOutput {
  let primaryText = "";

  if (typeof response.output === "string" && response.output.trim().length > 0) {
    primaryText = cleanCitationMarkers(response.output.trim(), response.results);

    // Append formatted source reference list if results exist and aren't already formatted at end
    if (response.results && response.results.length > 0 && !primaryText.includes("Sources:")) {
      const sourcesList = response.results
        .filter((r): r is SearchResult & { url: string } => Boolean(r.url))
        .map((r, idx) => {
          const num = idx + 1;
          const title = r.title ? r.title : r.url;
          const refStr = r.ref_id ? ` (${r.ref_id})` : "";
          const clickableUrl = formatMarkdownLink(r.url, r.url);
          return `[${num}] ${title}${refStr} - ${clickableUrl}`;
        });

      if (sourcesList.length > 0) {
        primaryText += `\n\nSources:\n${sourcesList.join("\n")}`;
      }
    }
  } else if (response.results && response.results.length > 0) {
    const formatted = response.results.map((item, idx) => {
      const num = idx + 1;
      const title = item.title ? item.title : item.url ?? `Result ${num}`;
      const clickableUrl = item.url ? formatMarkdownLink(item.url, item.url) : "";
      const urlLine = clickableUrl ? `   URL: ${clickableUrl}\n` : "";
      const refLine = item.ref_id ? `   Ref: [${num}] (${item.ref_id})\n` : "";
      const snippetLine = item.snippet ? cleanCitationMarkers(item.snippet, response.results) : "";
      return `[${num}] ${title}\n${refLine}${urlLine}${snippetLine ? "   " + snippetLine : ""}`.trim();
    });
    primaryText = `Web Search Results:\n\n${formatted.join("\n\n")}`;
  } else {
    primaryText = "No output or structured web results returned.";
  }

  return {
    content: [
      {
        type: "text",
        text: primaryText,
      },
    ],
    details: {
      command,
      results: response.results,
    },
  };
}

export function formatWebResponseText(response: SearchResponse): string {
  return formatWebToolResult({}, response).content[0].text;
}
