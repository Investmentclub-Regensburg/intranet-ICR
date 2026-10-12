"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/kit/StatusCard";
import {
  runEncryptionBackfillBatch,
  runEncryptionVerify,
  runFinishPlainClearing,
  runPlaintextClearBatch,
} from "@/app/(intranet)/admin/encryption/actions";
import type { BackfillReport, ClearReport, VerifyReport } from "@/lib/member-secrets-backfill";

type BackfillTotals = Omit<BackfillReport, "cursor">;

/**
 * Phase 3: Bestandsdaten verschlüsseln (Backfill in Portionen) und prüfen. Zeigt nur Zahlen, Profil-IDs
 * und Feldnamen, nie Werte. Danach (Phase 3b) Klartext leeren und abschließen – beides erst, wenn der
 * Prüflauf „bereit“ meldet, mit Bestätigung.
 */
export function EncryptionTools() {
  const [verify, setVerify] = useState<VerifyReport | null>(null);
  const [backfill, setBackfill] = useState<BackfillTotals | null>(null);
  const [busy, setBusy] = useState<"verify" | "backfill" | "clear" | null>(null);

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
    verify.authMeta.length === 0 &&
    verify.pendingPlainOnly.length === 0 &&
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
              {verify.finishedAt
                ? ready ? "Abgeschlossen, alles in Ordnung" : "Abgeschlossen, Befunde prüfen"
                : ready ? "Bereit zum Leeren des Klartexts" : "Noch nicht bereit"}
            </StatusPill>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Stat label="Profile" value={verify.profiles} />
            <Stat label="Mit sensiblen Daten" value={verify.withSensitivePlain} />
            <Stat label="Verschlüsselt" value={verify.secretsRows} />
            <Stat label="Klartext geleert" value={verify.cleared} />
            <Stat label="Ohne Verschlüsselung" value={verify.missing} warn />
            <Stat label="Nicht lesbar" value={verify.unreadable.length} warn />
            <Stat label="Abweichungen" value={verify.mismatches.length} warn />
            <Stat label="IBAN prüfen" value={verify.ibanReview.length} warn />
            <Stat label="Konto-Metadaten mit Daten" value={verify.authMeta.length} warn />
            <Stat label="Registrierung nur Klartext" value={verify.pendingPlainOnly.length} warn />
            <Stat label="Registrierung nicht übernommen" value={verify.pendingUnadopted.length} />
          </dl>
          {(verify.unreadable.length > 0 || verify.mismatches.length > 0 || verify.ibanReview.length > 0 ||
            verify.authMeta.length > 0 || verify.pendingPlainOnly.length > 0 || verify.pendingUnadopted.length > 0) && (
            <IdList
              title="Betroffene Profile bzw. Konten (IDs und Feldnamen, keine Daten)"
              items={[
                ...verify.ibanReview.map((id) => `${id} – IBAN-Format prüfen`),
                ...verify.authMeta.map((id) => `Konto ${id} – sensible Angaben in den Metadaten (docs/verschluesselung.md)`),
                ...verify.pendingPlainOnly.map((id) => `Konto ${id} – offene Registrierung nur mit Klartext`),
                ...verify.pendingUnadopted.map((id) => `Konto ${id} – Registrierung nicht übernommen (Hinweis)`),
                ...verify.unreadable.map((id) => `${id} – nicht lesbar`),
                ...verify.mismatches.map((m) => `${m.id} – abweichend: ${m.fields.join(", ")}`),
              ]}
            />
          )}
        </section>
      )}

      {verify && (
        <PlaintextClearing
          verify={verify}
          ready={Boolean(ready)}
          busy={busy !== null}
          setBusy={(b) => setBusy(b ? "clear" : null)}
          onDone={handleVerify}
        />
      )}
    </div>
  );
}

/**
 * Phase 3b: Klartext leeren (in Portionen, jedes Profil erneut geprüft) und abschließen (Endzustand: keine
 * Klartext-Schreibvorgänge mehr). Nicht umkehrbar ohne Backup – deshalb Bestätigung mit Häkchen.
 */
function PlaintextClearing({
  verify,
  ready,
  busy,
  setBusy,
  onDone,
}: {
  verify: VerifyReport;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<"clear" | "finish" | null>(null);
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState<{ cleared: number; skipped: ClearReport["skipped"] } | null>(null);

  if (verify.finishedAt) {
    return (
      <section className="rounded-2xl border bg-card p-6 space-y-2">
        <h2 className="text-lg font-bold">Klartext geleert</h2>
        <p className="text-sm text-muted-foreground">
          Abgeschlossen am {new Date(verify.finishedAt).toLocaleString("de-DE")}. Sensible Daten werden nur noch
          verschlüsselt gespeichert; die Datenbank weist Klartext ab.
        </p>
      </section>
    );
  }

  const canFinish = verify.withSensitivePlain === 0 && ready;
  // Leeren braucht nur saubere Zeilen; Metadaten/Registrierungen blockieren erst das Abschließen.
  const canClear =
    verify.missing === 0 && verify.ibanReview.length === 0 && verify.unreadable.length === 0 &&
    verify.mismatches.length === 0 && verify.withSensitivePlain > 0;

  async function runClear() {
    setBusy(true);
    const totals = { cleared: 0, skipped: [] as ClearReport["skipped"] };
    try {
      let cursor: string | null = null;
      for (let round = 0; round < 200; round++) {
        const { report, error }: Awaited<ReturnType<typeof runPlaintextClearBatch>> =
          await runPlaintextClearBatch(cursor);
        if (error || !report) {
          toast.error(error ?? "Leeren fehlgeschlagen.");
          break;
        }
        totals.cleared += report.cleared;
        totals.skipped.push(...report.skipped);
        setResult({ ...totals });
        if (!report.cursor) break;
        cursor = report.cursor;
      }
    } catch {
      toast.error("Leeren abgebrochen.");
    } finally {
      setBusy(false);
    }
    await onDone();
  }

  async function runFinish() {
    setBusy(true);
    try {
      const { error } = await runFinishPlainClearing();
      if (error) toast.error(error);
      else toast.success("Abgeschlossen. Klartext wird nicht mehr gespeichert.");
    } catch {
      toast.error("Abschließen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
    await onDone();
  }

  return (
    <section className="rounded-2xl border bg-card p-6 space-y-4">
      <h2 className="text-lg font-bold">Klartext leeren</h2>
      <p className="text-sm text-muted-foreground">
        Leert IBAN, BIC, Geburtsdatum, Adresse und Handynummer im Klartext – nur bei Mitgliedern, deren
        verschlüsselte Fassung gerade erneut geprüft wurde und übereinstimmt. Danach „Abschließen“: Ab dann
        speichert die Datenbank keinen Klartext mehr. Ohne Backup nicht umkehrbar.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={busy || !canClear} onClick={() => { setChecked(false); setConfirm("clear"); }}>
          Klartext leeren
        </Button>
        <Button variant="outline" disabled={busy || !canFinish} onClick={() => { setChecked(false); setConfirm("finish"); }}>
          Abschließen
        </Button>
      </div>
      {!canClear && !canFinish && (
        <p className="text-sm text-muted-foreground">Erst möglich, wenn der Prüflauf keine Befunde mehr meldet.</p>
      )}
      {result && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <Stat label="Geleert" value={result.cleared} />
          <Stat label="Übersprungen" value={result.skipped.length} warn />
        </dl>
      )}
      {result && (
        <IdList title="Nicht geleert (Profil-IDs, keine Daten)" items={result.skipped.map((s) => `${s.id} – ${s.reason}`)} />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "finish" ? "Abschließen?" : "Klartext leeren?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "finish"
                ? "Ab dann speichert die Datenbank sensible Daten nur noch verschlüsselt und weist Klartext ab – auch bei Registrierungen."
                : "Die Klartextspalten werden geleert. Danach sind die Daten nur noch mit dem Master Key lesbar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
            <span>Ein aktuelles Backup ist notiert, und die Hinterlegung des Master Keys samt Prüfwert ist geprüft.</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={!checked}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action === "clear") void runClear();
                if (action === "finish") void runFinish();
              }}
            >
              {confirm === "finish" ? "Abschließen" : "Leeren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
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
