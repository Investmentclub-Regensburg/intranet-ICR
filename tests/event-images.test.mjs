// Tests für die Event-Bild-Helfer in lib/events.ts (Auslieferung über die App, Umzug auf den eigenen Server).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectEventImageType,
  eventImageAppPath,
  eventImageSrc,
  eventImageStoragePath,
} from "../lib/events.ts";

const USER = "0b9f2c3e-1d2a-4c5b-8e7f-123456789abc";
const FILE = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const PATH = `${USER}/${FILE}.jpg`;

test("neues App-Format und alte Storage-URL ergeben denselben Pfad", () => {
  assert.equal(eventImageStoragePath(`/bilder/event-images/${PATH}`), PATH);
  assert.equal(
    eventImageStoragePath(`https://vxcwtfktnefreboejgpw.supabase.co/storage/v1/object/public/event-images/${PATH}`),
    PATH
  );
  // Andere Projekte (Test-Projekt) ebenso, Query-Teil wird ignoriert.
  assert.equal(
    eventImageStoragePath(`https://rkegvieoejmyutkowwwf.supabase.co/storage/v1/object/public/event-images/${PATH}?t=1`),
    PATH
  );
  assert.equal(eventImageSrc(`https://x.supabase.co/storage/v1/object/public/event-images/${PATH}`), `/bilder/event-images/${PATH}`);
  assert.equal(eventImageAppPath(PATH), `/bilder/event-images/${PATH}`);
});

test("frühe Uploads (<userId>-<ms>.<ext>) werden erkannt", () => {
  const old = `${USER}-1752000000000.jpeg`;
  assert.equal(eventImageStoragePath(`https://x.supabase.co/storage/v1/object/public/event-images/${old}`), old);
  assert.equal(eventImageSrc(`/bilder/event-images/${old}`), `/bilder/event-images/${old}`);
});

test("fremde oder manipulierte Adressen ergeben kein Bild", () => {
  for (const value of [
    null,
    undefined,
    "",
    "https://example.com/bild.jpg",
    `https://x.supabase.co/storage/v1/object/public/ICR/icr.png`,
    `/bilder/event-images/../${PATH}`,
    `/bilder/event-images/${USER}/../${FILE}.jpg`,
    `/bilder/event-images/${USER}%2F..%2F${FILE}.jpg`,
    `/bilder/event-images/${USER}/${FILE}.svg`,
    `/bilder/event-images/${USER}/${FILE}.JPG`,
    `/bilder/event-images/%E0%A4%A`,
    `javascript:alert(1)//storage/v1/object/public/event-images/${PATH}`,
  ]) {
    assert.equal(eventImageStoragePath(value), null, String(value));
    assert.equal(eventImageSrc(value), null, String(value));
  }
});

test("Bildtyp am Inhalt erkennen (Magic Bytes)", () => {
  const bytes = (...b) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  assert.equal(detectEventImageType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(detectEventImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(detectEventImageType(new TextEncoder().encode("GIF89a....")), "image/gif");
  assert.equal(detectEventImageType(new TextEncoder().encode("GIF87a....")), "image/gif");
  assert.equal(detectEventImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")), "image/webp");
  assert.equal(detectEventImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WAVEfmt ")), null);
  assert.equal(detectEventImageType(new TextEncoder().encode("<svg xmlns=...>")), null);
  assert.equal(detectEventImageType(new TextEncoder().encode("<html>")), null);
  assert.equal(detectEventImageType(new Uint8Array([0xff, 0xd8])), null);
  assert.equal(detectEventImageType(new Uint8Array()), null);
});
