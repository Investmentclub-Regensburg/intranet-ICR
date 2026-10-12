// Erzeugt einen neuen Master Key für die Verschlüsselung der Mitgliedsdaten (Base64, 32 Byte).
// Ausgabe nur im eigenen Terminal verwenden: in .env.local (Test-Projekt) bzw. Vercel (Produktion)
// eintragen und offline sichern. Nie committen, nie in Chats oder Tickets kopieren.
import { randomBytes } from "node:crypto";

console.log(randomBytes(32).toString("base64"));
