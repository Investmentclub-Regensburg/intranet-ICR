import "server-only";
import { parseKeyringEnv, type Keyring } from "@/lib/member-crypto";

/**
 * Keyring aus den Umgebungsvariablen (nur auf dem Server):
 *   MEMBER_DATA_MASTER_KEY      Base64, 32 Byte (`node scripts/generate-master-key.mjs`)
 *   MEMBER_DATA_MASTER_KEY_ID   z. B. "k1" (bei Rotation hochzählen)
 *   MEMBER_DATA_OLD_MASTER_KEYS optional, ältere Keys für die Rotation: "k1:<base64>,k2:<base64>"
 * Test-Projekt und Produktion haben verschiedene Master Keys.
 */
let cached: Keyring | null = null;

export function getKeyring(): Keyring {
  cached ??= parseKeyringEnv({
    current: process.env.MEMBER_DATA_MASTER_KEY,
    currentId: process.env.MEMBER_DATA_MASTER_KEY_ID,
    old: process.env.MEMBER_DATA_OLD_MASTER_KEYS,
  });
  return cached;
}
