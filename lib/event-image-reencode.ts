import sharp from "sharp";

/**
 * Event-Bilder werden beim Hochladen neu geschrieben (nur serverseitig, app/api/event-image/route.ts).
 *
 * Wozu:
 * - Im Speicher landet nur das Bild selbst. Angehängte Daten hinter dem Bildende, eingebettete Vorschauen
 *   oder fremde Abschnitte in der Datei (eine Datei kann zugleich ein gültiges Bild und etwas anderes sein)
 *   fallen weg.
 * - Metadaten werden entfernt: Aufnahmeort (GPS), Gerät, Aufnahmezeit. Event-Bilder sind öffentlich abrufbar.
 * - Eine kaputte oder absichtlich präparierte Datei scheitert hier und kommt gar nicht erst in den Speicher.
 * - Sehr große Fotos werden auf eine sinnvolle Größe für Flyer verkleinert (spart Speicher und Ladezeit).
 *
 * Das Format bleibt gleich (JPG bleibt JPG usw.), animierte GIF/WebP bleiben animiert. Die Drehung aus den
 * Metadaten (Hochkant-Fotos vom Handy) wird vorher ins Bild übernommen, weil sie sonst mit den Metadaten
 * verloren ginge.
 */

/** Obergrenze für die Bildfläche eines Einzelbilds (Breite x Höhe): Schutz vor winzigen Dateien, die entpackt
 *  riesig sind. 60 Megapixel deckt aktuelle Handykameras ab. */
const MAX_PIXELS = 60_000_000;
/** Bei Animationen zählt sharp die Fläche aller Einzelbilder zusammen; hier deutlich weniger zulassen. */
const MAX_PIXELS_ANIMATED = 20_000_000;
/** Längste Kante nach dem Neuschreiben (nur Einzelbilder; reicht für Flyer auf großen Bildschirmen). */
const MAX_EDGE = 2560;

export type ReencodeResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: "unreadable" | "too_large" };

async function encode(input: Uint8Array, type: string, animated: boolean, quality: number): Promise<Buffer | null> {
  let image = sharp(input, {
    animated,
    limitInputPixels: animated ? MAX_PIXELS_ANIMATED : MAX_PIXELS,
    failOn: "error",
  });
  // Drehen und Verkleinern nur bei Einzelbildern: Animationen tragen keine Aufnahme-Drehung, und sharp
  // verkleinert Animationen nicht zuverlässig über alle Einzelbilder.
  if (!animated) {
    image = image.autoOrient().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
  }
  switch (type) {
    case "image/jpeg":
      return image.jpeg({ quality, mozjpeg: true }).toBuffer();
    case "image/png":
      return image.png({ compressionLevel: 9, palette: quality < 90 }).toBuffer();
    case "image/webp":
      return image.webp({ quality }).toBuffer();
    case "image/gif":
      return image.gif().toBuffer();
    default:
      return null;
  }
}

/**
 * Schreibt das Bild neu. `maxBytes`: Liegt das Ergebnis darüber, wird einmal mit geringerer Qualität neu
 * geschrieben; reicht auch das nicht, kommt `too_large`.
 */
export async function reencodeEventImage(input: Uint8Array, type: string, maxBytes = Infinity): Promise<ReencodeResult> {
  try {
    const meta = await sharp(input, { animated: true, limitInputPixels: false }).metadata();
    const animated = (meta.pages ?? 1) > 1;
    for (const quality of [90, 75]) {
      const output = await encode(input, type, animated, quality);
      if (!output) return { ok: false, reason: "unreadable" };
      if (output.byteLength <= maxBytes) {
        return { ok: true, bytes: new Uint8Array(output.buffer, output.byteOffset, output.byteLength) };
      }
      if (animated || type === "image/gif") break; // Qualität ändert bei GIF/Animationen kaum etwas
    }
    return { ok: false, reason: "too_large" };
  } catch {
    // Nicht lesbar, beschädigt oder zu groß in Pixeln: Details gehören nicht in die Antwort.
    return { ok: false, reason: "unreadable" };
  }
}
