// Tests für das Neu-Schreiben von Event-Bildern beim Hochladen (lib/event-image-reencode.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { reencodeEventImage } from "../lib/event-image-reencode.ts";

const FREMD = Buffer.from("<script>alert(1)</script>#!/bin/sh\nrm -rf /\n", "utf8");

async function beispiel(format, optionen = {}) {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 163, g: 1, b: 1 } } })
    [format](optionen)
    .toBuffer();
}

test("JPG: Metadaten (Aufnahmeort, Gerät) werden entfernt, das Bild bleibt", async () => {
  const mitExif = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#a30101" } })
    .withExif({ IFD0: { Make: "TestKamera", Model: "T-1000" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 0/1 0/1" } })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(mitExif).metadata()).exif, "Vorbedingung: Eingabe trägt EXIF");

  const r = await reencodeEventImage(new Uint8Array(mitExif), "image/jpeg");
  assert.equal(r.ok, true);
  const meta = await sharp(r.bytes).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 40);
  assert.equal(meta.height, 20);
  assert.equal(meta.exif, undefined);
  assert.equal(Buffer.from(r.bytes).includes(Buffer.from("TestKamera")), false);
});

test("angehängte Fremddaten hinter dem Bildende fallen weg", async () => {
  for (const [format, type] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["gif", "image/gif"]]) {
    const bild = await beispiel(format);
    const praepariert = Buffer.concat([bild, FREMD]);
    const r = await reencodeEventImage(new Uint8Array(praepariert), type);
    assert.equal(r.ok, true, format);
    assert.equal(Buffer.from(r.bytes).includes(Buffer.from("<script>")), false, format);
    assert.equal((await sharp(r.bytes).metadata()).format, format);
  }
});

test("Hochkant-Foto: Drehung aus den Metadaten wird ins Bild übernommen", async () => {
  const gedreht = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#a30101" } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const r = await reencodeEventImage(new Uint8Array(gedreht), "image/jpeg");
  assert.equal(r.ok, true);
  const meta = await sharp(r.bytes).metadata();
  assert.equal(meta.width, 20);
  assert.equal(meta.height, 40);
});

test("animiertes GIF bleibt animiert", async () => {
  // Drei verschiedenfarbige Einzelbilder zu einer Animation zusammensetzen.
  const einzelbilder = await Promise.all(
    ["#a30101", "#01a301", "#0101a3"].map((background) =>
      sharp({ create: { width: 10, height: 10, channels: 3, background } }).png().toBuffer()
    )
  );
  const animiert = await sharp(einzelbilder, { join: { animated: true } }).gif({ delay: [100, 100, 100] }).toBuffer();
  assert.equal((await sharp(animiert, { animated: true }).metadata()).pages, 3, "Vorbedingung: 3 Einzelbilder");

  const r = await reencodeEventImage(new Uint8Array(animiert), "image/gif");
  assert.equal(r.ok, true);
  assert.equal((await sharp(r.bytes, { animated: true }).metadata()).pages, 3);
});

test("kein Bild, kaputtes Bild und unbekannter Typ werden abgelehnt", async () => {
  assert.equal((await reencodeEventImage(new Uint8Array(FREMD), "image/jpeg")).ok, false);
  const kaputt = (await beispiel("png")).subarray(0, 40);
  assert.equal((await reencodeEventImage(new Uint8Array(kaputt), "image/png")).ok, false);
  assert.equal((await reencodeEventImage(new Uint8Array(await beispiel("png")), "image/svg+xml")).ok, false);
});
