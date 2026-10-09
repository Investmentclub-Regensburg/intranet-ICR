"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/kit/IconButton";
import { Segmented } from "@/components/kit/Segmented";
import { Tile } from "@/components/kit/Tile";
import { WizardNav, WizardProgress, WizardStep, useWizard } from "@/components/kit/Wizard";
import { FinancePreview } from "./FinancePreview";
import {
  getFinanceExportData,
  setFinanceOverride,
  type Semester,
  type FinanceMemberRow,
  type FinanceOverrideAction,
  type FinancePreviewRow,
  type FilterStats,
  type SepaCreditor,
} from "@/app/(intranet)/admin/actions/finance";
import {
  buildSepaIdentifier,
  buildNumericIdentifier,
  escapeXml,
  sanitizeNameForBank,
  sepaDate,
} from "@/lib/sepa";
import { joinCsvRow } from "@/lib/csv";

// Finanzen als Wizard: Semester → Vorschau → Export. Die Vorschau (FinancePreview) zeigt alle
// Profile nach Kategorie und erlaubt Anpassungen je Semester (finance_export_overrides); der
// Export (CSV, SEPA-XML pain.008) lädt die Lastschriften danach frisch vom Server und
// berücksichtigt dieselben Anpassungen.

const MIN_YEAR = 2000;

function getMaxYear() {
  return new Date().getFullYear() + 1;
}

function getPeriodLabel(semester: Semester, year: number): string {
  const yy = String(year).slice(-2);
  if (semester === "WiSe") {
    const yyNext = String(year + 1).slice(-2);
    return `WS${yy}/${yyNext}`;
  }
  return `SS${yy}`;
}

function periodName(semester: Semester, year: number): string {
  return semester === "WiSe" ? `Wintersemester ${year}/${String(year + 1).slice(-2)}` : `Sommersemester ${year}`;
}

/** Laufendes Semester nach den Stichtagen (SoSe ab 15.03., WiSe ab 01.10.). */
function currentPeriod(): { semester: Semester; year: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (m >= 10) return { semester: "WiSe", year: y };
  if (m > 3 || (m === 3 && d >= 15)) return { semester: "SoSe", year: y };
  return { semester: "WiSe", year: y - 1 };
}

const STEPS = [
  { key: "semester", label: "Semester" },
  { key: "preview", label: "Vorschau" },
  { key: "export", label: "Export" },
] as const;

const SEMESTER_OPTIONS = [
  { key: "SoSe", label: "Sommersemester" },
  { key: "WiSe", label: "Wintersemester" },
] as const;

export function FinanceExport() {
  const start = currentPeriod();
  const [semester, setSemester] = useState<Semester>(start.semester);
  const [year, setYear] = useState<number>(start.year);
  const maxYear = getMaxYear();
  const wizard = useWizard(STEPS);
  const [validMembers, setValidMembers] = useState<FinanceMemberRow[]>([]);
  const [previewRows, setPreviewRows] = useState<FinancePreviewRow[]>([]);
  const [overridesAvailable, setOverridesAvailable] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [stats, setStats] = useState<FilterStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloading, setDownloading] = useState<"" | "csv" | "xml">("");
  const [downloaded, setDownloaded] = useState<("csv" | "xml")[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Zeitraum der geladenen Vorschau – der Export nutzt genau diesen Zeitraum.
  const [loadedPeriod, setLoadedPeriod] = useState<{ semester: Semester; year: number } | null>(null);

  const handleLoadPreview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getFinanceExportData(semester, year);
      setValidMembers(result.validMembers);
      setPreviewRows(result.rows);
      setOverridesAvailable(result.overridesAvailable);
      setStats(result.stats);
      setLoadedPeriod({ semester, year });
      setDownloaded([]);
      wizard.complete("semester");
    } catch (err) {
      console.error("Fehler beim Laden der Daten:", err);
      setValidMembers([]);
      setPreviewRows([]);
      setStats(null);
      setLoadedPeriod(null);
      setError(
        err instanceof Error
          ? err.message
          : "Es gab einen Fehler beim Laden der Daten."
      );
    } finally {
      setIsLoading(false);
    }
  };

  /** Anpassung speichern und die Vorschau neu berechnen (Zahlen, Listen, Summe). */
  async function handleOverride(row: FinancePreviewRow, action: FinanceOverrideAction | null) {
    if (!loadedPeriod || pendingId) return;
    setPendingId(row.id);
    try {
      const { error: saveError } = await setFinanceOverride(loadedPeriod.semester, loadedPeriod.year, row.id, action);
      if (saveError) {
        toast.error(saveError);
        return;
      }
      const result = await getFinanceExportData(loadedPeriod.semester, loadedPeriod.year);
      setValidMembers(result.validMembers);
      setPreviewRows(result.rows);
      setStats(result.stats);
      setDownloaded([]);
      const name = `${row.firstName} ${row.lastName}`;
      const label = getPeriodLabel(loadedPeriod.semester, loadedPeriod.year);
      toast.success(
        action === "exclude"
          ? `${name} ist aus dem Einzug ${label} entfernt.`
          : action === "free_semester"
            ? `${name} hat im ${label} ein Freisemester.`
            : action === "include"
              ? `${name} ist im Einzug ${label} aufgenommen.`
              : `Anpassung für ${name} zurückgesetzt.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anpassung konnte nicht gespeichert werden.");
    } finally {
      setPendingId(null);
    }
  }

  /** Download mit Ladezustand und Häkchen danach. */
  async function runDownload(kind: "csv" | "xml") {
    if (downloading) return;
    setDownloading(kind);
    try {
      const ok = kind === "csv" ? await handleExportCsv() : await handleExportSepaXml();
      if (ok) setDownloaded((list) => (list.includes(kind) ? list : [...list, kind]));
    } finally {
      setDownloading("");
    }
  }

  /** Vollständige Exportdaten erst beim Download vom Server holen (Vorschau zeigt gekürzte IBANs). */
  async function loadExportRows(): Promise<{
    rows: FinanceMemberRow[];
    creditor: SepaCreditor | null;
    period: { semester: Semester; year: number };
  } | null> {
    if (!loadedPeriod) return null;
    setError(null);
    try {
      const { validMembers: rows, creditor } = await getFinanceExportData(
        loadedPeriod.semester,
        loadedPeriod.year,
        "export"
      );
      return rows.length ? { rows, creditor, period: loadedPeriod } : null;
    } catch (err) {
      console.error("Fehler beim Laden der Exportdaten:", err);
      setError(
        err instanceof Error ? err.message : "Es gab einen Fehler beim Laden der Exportdaten."
      );
      return null;
    }
  }

  async function handleExportCsv(): Promise<boolean> {
    const data = await loadExportRows();
    if (!data) return false;
    const { rows } = data;

    const header = "Name;IBAN;BIC;Betrag;Mandatsreferenz";
    const lines = rows.map((row) => {
      const name = `${row.firstName} ${row.lastName}`.trim();
      const amount = row.amount.toFixed(2).replace(".", ",");
      const mandateId = buildNumericIdentifier(row.id, 35);
      // Zellen entschärfen (Formel-Injection) und korrekt quoten.
      return joinCsvRow([name, row.iban, row.bic, amount, mandateId], ";");
    });
    const csv = [header, ...lines].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date();
    const fileName = `sepa_export_${today.toISOString().slice(0, 10)}.csv`;
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  async function handleExportSepaXml(): Promise<boolean> {
    const data = await loadExportRows();
    if (!data) return false;
    const { rows, period, creditor } = data;
    if (!creditor) {
      setError(
        "SEPA-Gläubigerdaten sind nicht konfiguriert (SEPA_CREDITOR_IBAN, SEPA_CREDITOR_BIC, SEPA_CREDITOR_ID). Bitte in der Server-Umgebung hinterlegen."
      );
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    const periodLabel = getPeriodLabel(period.semester, period.year);
    const periodToken = buildSepaIdentifier(periodLabel, 10) || "PERIODE";
    const messageId =
      buildSepaIdentifier(`ICRBEITRAG${periodToken}${today.replace(/-/g, "")}`) ||
      "ICRBEITRAG";

    const totalAmount = rows
      .reduce((sum, row) => sum + row.amount, 0)
      .toFixed(2);

    // Gläubigerdaten kommen aus der Server-Umgebung (SEPA_CREDITOR_*), nicht aus dem Bundle.
    const creditorName = creditor.name;
    const creditorIban = creditor.iban;
    const creditorBic = creditor.bic;
    const creditorId = creditor.creditorId;

    const txInfos = rows
      .map((row, idx) => {
        const nameRaw = `${row.firstName} ${row.lastName}`.trim();
        const name = sanitizeNameForBank(nameRaw) || "MITGLIED";
        const amount = row.amount.toFixed(2);
        const mndtId =
          buildNumericIdentifier(row.id, 35) || String(idx + 1).padStart(6, "0");
        const endToEndId =
          buildSepaIdentifier(`${messageId}${idx + 1}`, 35) || `E2E${idx + 1}`;
        const dtOfSgntr = escapeXml(sepaDate(row.mandateDate, today));
        const bic = buildSepaIdentifier(row.bic, 11);
        const dbtrAgtXml = bic
          ? `<DbtrAgt>
          <FinInstnId>
            <BIC>${escapeXml(bic)}</BIC>
          </FinInstnId>
        </DbtrAgt>`
          : `<DbtrAgt>
          <FinInstnId>
            <Othr>
              <Id>NOTPROVIDED</Id>
            </Othr>
          </FinInstnId>
        </DbtrAgt>`;

        return `
      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${amount}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(mndtId)}</MndtId>
            <DtOfSgntr>${dtOfSgntr}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        ${dbtrAgtXml}
        <Dbtr>
          <Nm>${escapeXml(name)}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${escapeXml(row.iban)}</IBAN>
          </Id>
        </DbtrAcct>
      </DrctDbtTxInf>`;
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${escapeXml(messageId)}</MsgId>
      <CreDtTm>${today}T00:00:00</CreDtTm>
      <NbOfTxs>${rows.length}</NbOfTxs>
      <CtrlSum>${totalAmount}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(creditorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(messageId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${rows.length}</NbOfTxs>
      <CtrlSum>${totalAmount}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>CORE</Cd>
        </LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${today}</ReqdColltnDt>
      <Cdtr>
        <Nm>${escapeXml(creditorName)}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${escapeXml(creditorIban)}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BIC>${escapeXml(creditorBic)}</BIC>
        </FinInstnId>
      </CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>${escapeXml(creditorId)}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>
      ${txInfos}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;

    const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileName = `sepa_export_${today}.xml`;
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }


  const stepProps = (key: (typeof STEPS)[number]["key"]) => ({
    stepKey: key,
    active: wizard.step === key,
    direction: wizard.direction,
  });
  const period = loadedPeriod ?? { semester, year };
  const total = validMembers.reduce((sum, row) => sum + row.amount, 0);
  const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const errorLine = error ? (
    <p className="text-sm font-medium text-destructive" role="alert">
      {error}
    </p>
  ) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <WizardProgress
        count={wizard.count}
        index={wizard.index}
        label={STEPS[wizard.index].label}
        className="mx-auto max-w-xl"
      />

      <WizardStep {...stepProps("semester")} title="Für welches Semester?" className="mx-auto max-w-xl">
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <Segmented
            layoutId="finance-semester"
            radio
            fill
            ariaLabel="Semester"
            options={SEMESTER_OPTIONS}
            value={semester}
            onChange={(key) => setSemester(key)}
          />
          <div className="flex items-center justify-between gap-3">
            <IconButton
              label="Jahr zurück"
              variant="outline"
              onClick={() => setYear((y) => Math.max(MIN_YEAR, y - 1))}
              disabled={year <= MIN_YEAR}
            >
              <ChevronLeft />
            </IconButton>
            <span className="text-3xl font-bold tracking-[-0.04em] tabular-nums" aria-live="polite">
              {semester === "WiSe" ? `${year}/${String(year + 1).slice(-2)}` : year}
            </span>
            <IconButton
              label="Jahr vor"
              variant="outline"
              onClick={() => setYear((y) => Math.min(maxYear, y + 1))}
              disabled={year >= maxYear}
            >
              <ChevronRight />
            </IconButton>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Stichtag {semester === "SoSe" ? `15.03.${year}` : `01.10.${year}`}. Wer ab dem Stichtag eintritt, hat ein
            Freisemester.
          </p>
        </div>
        {errorLine}
        <WizardNav>
          <Button type="button" size="lg" onClick={handleLoadPreview} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {isLoading ? "Lädt…" : "Vorschau laden"}
            {!isLoading && <ArrowRight aria-hidden />}
          </Button>
        </WizardNav>
      </WizardStep>

      <WizardStep {...stepProps("preview")} title={`Vorschau ${periodName(period.semester, period.year)}`}>
        {stats && (
          <FinancePreview
            rows={previewRows}
            stats={stats}
            editable={overridesAvailable}
            periodLabel={getPeriodLabel(period.semester, period.year)}
            pendingId={pendingId}
            onOverride={handleOverride}
          />
        )}

        {errorLine}
        <WizardNav onBack={() => wizard.goTo("semester")}>
          <Button
            type="button"
            size="lg"
            onClick={() => wizard.complete("preview")}
            disabled={validMembers.length === 0}
          >
            Weiter zum Export
            <ArrowRight aria-hidden />
          </Button>
        </WizardNav>
      </WizardStep>

      <WizardStep {...stepProps("export")} title="Welche Datei brauchst du?" className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">
          {getPeriodLabel(period.semester, period.year)} · {validMembers.length}{" "}
          {validMembers.length === 1 ? "Lastschrift" : "Lastschriften"} · {euro(total)}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Tile
            Icon={FileSpreadsheet}
            title="CSV"
            meta="Tabelle mit Name, IBAN, BIC, Betrag, Mandatsreferenz"
            onOpen={() => runDownload("csv")}
            className="min-h-[11rem]"
            footer={<DownloadState busy={downloading === "csv"} done={downloaded.includes("csv")} />}
          />
          <Tile
            Icon={FileCode2}
            title="SEPA-XML"
            meta="Lastschriftdatei für die Bank (pain.008)"
            onOpen={() => runDownload("xml")}
            className="min-h-[11rem]"
            footer={<DownloadState busy={downloading === "xml"} done={downloaded.includes("xml")} />}
          />
        </div>
        {errorLine}
        <WizardNav onBack={() => wizard.goTo("preview")}>
          <span />
        </WizardNav>
      </WizardStep>
    </div>
  );
}

function DownloadState({ busy, done }: { busy: boolean; done: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
      {busy ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Wird erstellt…
        </>
      ) : done ? (
        <>
          <Check className="size-3.5" aria-hidden />
          Heruntergeladen
        </>
      ) : (
        "Herunterladen"
      )}
    </span>
  );
}
