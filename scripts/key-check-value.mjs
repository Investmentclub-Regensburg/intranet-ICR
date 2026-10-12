// Gibt Key-ID und Prüfwert (KCV) des konfigurierten Master Keys aus – zum Registrieren in der Tabelle
// member_crypto_keys. Der Prüfwert ist kein Geheimnis; der Key selbst wird nicht ausgegeben.
//   node --env-file=.env.local scripts/key-check-value.mjs
import { keyCheckValue, parseKeyringEnv } from "../lib/member-crypto.ts";

const ring = parseKeyringEnv({
  current: process.env.MEMBER_DATA_MASTER_KEY,
  currentId: process.env.MEMBER_DATA_MASTER_KEY_ID,
  old: process.env.MEMBER_DATA_OLD_MASTER_KEYS,
});
console.log(`key_id=${ring.currentId} kcv=${keyCheckValue(ring)}`);
console.log(
  `SQL: insert into public.member_crypto_keys (key_id, kcv) values ('${ring.currentId}', '${keyCheckValue(ring)}');`,
);
