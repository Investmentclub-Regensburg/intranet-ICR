"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/kit/StatusCard";
import {
  runEncryptionBackfillBatch,
  runEncryptionVerify,
} from "@/app/(intranet)/admin/encryption/actions";
import type { BackfillReport, VerifyReport } from "@/lib/member-secrets-backfill";

type BackfillTotals = Omit<BackfillReport, "cursor">;

/**
 * Phase 3: Bestandsdaten verschlüsseln (Backfill in Portionen) und prüfen. Zeigt nur Zahlen, Profil-IDs
 * und Feldnamen, nie Werte. Der Klartext bleibt unverändert; geleert wird er erst in einem eigenen Schritt.
 */
export function EncryptionTools() {
  const [verify, setVerify] = useState<VerifyReport | null>(null);
  const [backfill, setBackfill] = useState<BackfillTotals | null>(null);
  const [busy, setBusy] = useState<"verify" | "backfill" | null>(null);

  async function handleVerify() {
    setBusy("verify");
    try {
      const { report, error } = await runEncryptionVerify();
      if (error) toast.error(error);
      else setVerify(report ?? null);
    } catch {
      toast.error("Prüfung fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  }

  async function handleBackfill() {
    setBusy("backfill");
    const totals: BackfillTotals = {
      created: 0, remaining: 0, ibanReview: [], pending: [], rolledBack: [], failed: [], unverified: [],
    };
    try {
      // Portionen ab dem letzten bearbeiteten Profil, bis keines mehr übrig ist (Problemfälle werden
      // übersprungen und unten aufgelistet, sie blockieren die übrigen nicht).
      let cursor: string | null = null;
      for (let round = 0; round < 200; round++) {
        const { report, error }: Awaited<ReturnType<typeof runEncryptionBackfillBatch>> =
          await runEncryptionBackfillBatch(cursor);
        if (error || !report) {
          toast.error(error ?? "Backfill fehlgeschlagen.");
          break;
        }
        totals.created += report.created;
        totals.remaining = report.remaining;
        totals.ibanReview.push(...report.ibanReview);
        totals.pending.push(...report.pending);
        totals.rolledBack.push(...report.rolledBack);
        totals.failed.push(...report.failed);
        totals.unverified.push(...report.unverified);
        setBackfill({ ...totals });
        if (!report.cursor) break;
        cursor = report.cursor;
      }
    } catch {
      toast.error("Backfill abgebrochen.");
    } finally {
      setBusy(null);
    }
    await handleVerify();
  }

  const ready =
    verify &&
    verify.missing === 0 &&
    verify.ibanReview.length === 0 &&
    verify.unreadable.length === 0 &&
    verify.mismatches.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5" aria-hidden />
          <h2 className="text-lg font-bold">Bestandsdaten verschlüsseln</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Legt für alle Mitglieder mit IBAN, Adresse, Telefon oder Geburtsdatum im Klartext die verschlüsselte
          Fassung an und prüft jede sofort gegen den Klartext. Der Klartext bleibt unverändert. Mehrfach
          ausführbar; bereits verschlüsselte Mitglieder werden übersprungen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleVerify} variant="outline" disabled={busy !== null}>
            {busy === "verify" && <Loader2 className="animate-spin" />}Prüfen
          </Button>
          <Button onClick={handleBackfill} disabled={busy !== null}>
            {busy === "backfill" && <Loader2 className="animate-spin" />}Verschlüsseln
          </Button>
        </div>

        {backfill && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Stat label="Neu verschlüsselt" value={backfill.created} />
            <Stat label="Noch offen" value={backfill.remaining} />
            <Stat label="IBAN prüfen" value={backfill.ibanReview.length} warn />
            <Stat label="Registrierung offen" value={backfill.pending.length} />
            <Stat label="Zurückgenommen" value={backfill.rolledBack.length} warn />
            <Stat label="Fehlgeschlagen" value={backfill.failed.length + backfill.unverified.length} warn />
          </dl>
        )}
        {backfill && (
          <IdList
            title="Nicht verschlüsselt (Profil-IDs, keine Daten)"
            items={[
              ...backfill.ibanReview.map((id) => `${id} – IBAN-Format prüfen und im Mitglied korrigieren`),
              ...backfill.pending.map((id) => `${id} – Registrierung noch offen, später erneut`),
              ...backfill.rolledBack.map((r) => `${r.id} – abweichend: ${r.fields.join(", ")}`),
              ...backfill.failed.map((id) => `${id} – Fehler, nichts angelegt`),
              ...backfill.unverified.map((id) => `${id} – angelegt, aber ungeprüft: bitte „Prüfen“`),
            ]}
          />
        )}
      </section>

      {verify && (
        <section className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Prüfergebnis</h2>
            <StatusPill status={ready ? "done" : "open"}>
              {ready ? "Bereit zum Leeren des Klartexts" : "Noch nicht bereit"}
            </StatusPill>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Stat label="Profile" value={verify.profiles} />
            <Stat label="Mit sensiblen Daten" value={verify.withSensitivePlain} />
            <Stat label="Verschlüsselt" value={verify.secretsRows} />
            <Stat label="Ohne Verschlüsselung" value={verify.missing} warn />
            <Stat label="Nicht lesbar" value={verify.unreadable.length} warn />
            <Stat label="Abweichungen" value={verify.mismatches.length} warn />
            <Stat label="IBAN prüfen" value={verify.ibanReview.length} warn />
          </dl>
          {(verify.unreadable.length > 0 || verify.mismatches.length > 0 || verify.ibanReview.length > 0) && (
            <IdList
              title="Betroffene Profile (IDs und Feldnamen, keine Daten)"
              items={[
                ...verify.ibanReview.map((id) => `${id} – IBAN-Format prüfen`),
                ...verify.unreadable.map((id) => `${id} – nicht lesbar`),
                ...verify.mismatches.map((m) => `${m.id} – abweichend: ${m.fields.join(", ")}`),
              ]}
            />
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold tabular-nums ${warn && value > 0 ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}

function IdList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="max-h-60 overflow-y-auto rounded-md border p-2 font-mono text-xs">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
