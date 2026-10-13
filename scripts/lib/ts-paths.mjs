// Lädt die TypeScript-Bibliotheken der App ohne Next.js (Node-Typ-Stripping): löst "@/…" wie in tsconfig.json
// auf und ersetzt "server-only" durch ein leeres Modul. Nur für Skripte unter scripts/.
//   node --import ./scripts/lib/ts-paths.mjs scripts/<skript>.mjs
import { register } from "node:module";

register("./ts-paths-hooks.mjs", import.meta.url);
