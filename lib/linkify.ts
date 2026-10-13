/**
 * Text in Abschnitte zerlegen: normaler Text und Links (http(s)://… oder www.…). Nur http und https,
 * damit keine javascript:- oder data:-Links entstehen. Satzzeichen am Ende (z. B. „…/anmeldung.“) und eine
 * schließende Klammer ohne öffnende gehören nicht zum Link.
 */
export type TextPart = { type: "text"; value: string } | { type: "link"; value: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
// Zeichen, die am Ende nicht zum Link gehören.
const TRAILING = new Set([...".,;:!?'\"»«“”‚‘’]}*…"]);

function trimUrl(raw: string): string {
  // Von hinten kürzen (linear): Satzzeichen immer, eine schließende Klammer nur, wenn sie im Link
  // nicht geöffnet wurde (z. B. bleibt „…/Aktie_(Wertpapier)“ ganz).
  const opened = raw.split("(").length - 1;
  let closed = raw.split(")").length - 1;
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1];
    if (TRAILING.has(ch)) end--;
    else if (ch === ")" && closed > opened) {
      end--;
      closed--;
    } else break;
  }
  return raw.slice(0, end);
}

export function linkifyText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const url = trimUrl(match[0]);
    const start = match.index ?? 0;
    if (!url || /^(?:https?:\/\/|www\.)$/i.test(url)) continue;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    parts.push({ type: "link", value: url, href });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
