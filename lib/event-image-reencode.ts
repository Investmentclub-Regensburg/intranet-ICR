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
 *
 * Das Format bleibt gleich (JPG bleibt JPG usw.), animierte GIF/WebP bleiben animiert. Die Drehung aus den
 * Metadaten (Hochkant-Fotos vom Handy) wird vorher ins Bild übernommen, weil sie sonst mit den Metadaten
 * verloren ginge.
 */

/** Obergrenze für die Bildfläche (Breite x Höhe, bei Animationen über alle Einzelbilder): Schutz vor
 *  winzigen Dateien, die entpackt riesig sind. 60 Megapixel deckt aktuelle Handykameras ab. */
const MAX_PIXELS = 60_000_000;

export type ReencodeResult = { ok: true; bytes: Uint8Array } | { ok: false };

export async function reencodeEventImage(input: Uint8Array, type: string): Promise<ReencodeResult> {
  try {
    const source = sharp(input, { animated: true, limitInputPixels: MAX_PIXELS, failOn: "error" });
    const meta = await source.metadata();
    const animated = (meta.pages ?? 1) > 1;
    // Drehen nur bei Einzelbildern: Animationen tragen keine Aufnahme-Drehung.
    const image = animated ? source : source.autoOrient();

    let output: Buffer;
    switch (type) {
      case "image/jpeg":
        output = await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        break;
      case "image/png":
        output = await image.png({ compressionLevel: 9 }).toBuffer();
        break;
      case "image/webp":
        output = await image.webp({ quality: 90 }).toBuffer();
        break;
      case "image/gif":
        output = await image.gif().toBuffer();
        break;
      default:
        return { ok: false };
    }
    return { ok: true, bytes: new Uint8Array(output.buffer, output.byteOffset, output.byteLength) };
  } catch {
    // Nicht lesbar, beschädigt oder zu groß: Details gehören nicht in die Antwort.
    return { ok: false };
  }
}
