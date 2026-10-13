"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  GraduationCap,
  KeyRound,
  Megaphone,
  Pencil,
  Share2,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabBar } from "@/components/kit/TabBar";
import { AddTile, Tile, TileGrid } from "@/components/kit/Tile";
import { IconButton } from "@/components/kit/IconButton";
import { Segmented } from "@/components/kit/Segmented";
import { EmptyState, PageHeader } from "@/components/kit/PageHeader";
import {
  PickTile,
  WizardDialog,
  WizardNav,
  WizardProgress,
  WizardStep,
  WizardSummary,
  reportStepValidity,
  useWizard,
  type WizardRow,
} from "@/components/kit/Wizard";

// Beispieldaten nur für die Vorschau.
const TABS = [
  { key: "overview", label: "Übersicht" },
  { key: "members", label: "Mitglieder" },
  { key: "finance", label: "Finanzen" },
  { key: "news", label: "News" },
  { key: "events", label: "Events" },
  { key: "bvh", label: "BVH", count: 2 },
  { key: "alumni", label: "Alumni", count: 1 },
];

const AREAS = [
  { title: "Mitglieder", meta: "Rollen und Status", Icon: Users },
  { title: "Finanzen & SEPA", meta: "Beitragseinzug je Semester", Icon: Banknote },
  { title: "News", meta: "Schwarzes Brett", Icon: Megaphone },
  { title: "Events", meta: "Anlegen, teilen, Teilnehmer", Icon: CalendarDays },
  { title: "BVH-Zugänge", meta: "2 offene Anfragen", Icon: KeyRound },
  { title: "Alumni-Anträge", meta: "1 offener Antrag", Icon: GraduationCap },
];

export function KitPreview() {
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState<"tiles" | "empty">("tiles");
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="space-y-10">
      <TabBar ariaLabel="Admin-Bereich" layoutId="kit-admin-tabs" items={TABS} activeKey={tab} onSelect={setTab} />

      <section className="space-y-5">
        <PageHeader
          eyebrow="Verwaltung"
          title="Admin-Bereich"
          action={
            <Segmented
              ariaLabel="Ansicht"
              layoutId="kit-view"
              value={view}
              onChange={setView}
              options={[
                { key: "tiles", label: "Kacheln" },
                { key: "empty", label: "Leer" },
              ]}
            />
          }
        />
        {view === "tiles" ? (
          <TileGrid>
            {AREAS.map((a) => (
              <Tile
                key={a.title}
                Icon={a.Icon}
                title={a.title}
                meta={a.meta}
                onOpen={() => setWizardOpen(true)}
                actions={
                  <>
                    <IconButton label="Bearbeiten">
                      <Pencil />
                    </IconButton>
                    <IconButton label="Löschen" variant="danger">
                      <Trash2 />
                    </IconButton>
                  </>
                }
              />
            ))}
            <AddTile label="Event anlegen" onClick={() => setWizardOpen(true)} />
          </TileGrid>
        ) : (
          <EmptyState
            title="Noch keine Events"
            hint="Lege das erste Event an, die Mitglieder sehen es sofort."
            action={<Button onClick={() => setWizardOpen(true)}>Erstes Event anlegen</Button>}
          />
        )}
      </section>

      <section className="space-y-4">
        <p className="eyebrow">Bedienelemente</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primär</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Sekundär</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Löschen</Button>
          <IconButton label="Teilen" variant="outline">
            <Share2 />
          </IconButton>
          <IconButton label="Neu" variant="primary">
            <Tag />
          </IconButton>
        </div>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="kit-a">Titel</Label>
            <Input id="kit-a" placeholder="z. B. zeb Case Study" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kit-b">Ort</Label>
            <Input id="kit-b" placeholder="z. B. Hörsaal" />
          </div>
        </div>
        <div className="h-1 w-40 bg-brand-gradient" aria-hidden />
      </section>

      <DemoEventWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

const STEPS = [
  { key: "title", label: "Titel", Icon: Tag },
  { key: "date", label: "Datum", Icon: CalendarDays },
  { key: "registration", label: "Anmeldung", Icon: Users },
  { key: "check", label: "Prüfen" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** Wizard-Muster als Modal (Vorschau für den Event-Wizard aus Paket 4, ohne Speichern). */
function DemoEventWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const wizard = useWizard(STEPS);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [registration, setRegistration] = useState<"" | "ja" | "nein">("");

  const next = () => {
    if (!reportStepValidity(formRef.current, wizard.step)) return;
    wizard.complete();
  };

  const rows: WizardRow<StepKey>[] = [];
  if (wizard.completed.includes("title")) rows.push({ key: "title", label: "Titel", Icon: Tag, value: title });
  if (wizard.completed.includes("date")) rows.push({ key: "date", label: "Datum", Icon: CalendarDays, value: date });
  if (wizard.completed.includes("registration"))
    rows.push({ key: "registration", label: "Anmeldung", Icon: Users, value: registration === "ja" ? "Mit Anmeldung" : "Ohne Anmeldung" });

  const props = (key: StepKey) => ({ stepKey: key, active: wizard.step === key, direction: wizard.direction });

  return (
    <WizardDialog open={open} onOpenChange={onOpenChange} title="Neues Event" dirty={title.trim() !== ""}>
      <form ref={formRef} noValidate onSubmit={(e) => e.preventDefault()} className="grid md:grid-cols-[17rem_1fr]">
        <aside className="space-y-5 border-b border-border bg-muted/50 p-5 md:border-r md:border-b-0">
          <WizardProgress count={wizard.count} index={wizard.index} label={STEPS[wizard.index].label} />
          <WizardSummary rows={rows} activeKey={wizard.step} onSelect={wizard.goTo} className="-mx-3" />
        </aside>
        <div className="p-6">
          <WizardStep {...props("title")} title="Wie heißt das Event?">
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. zeb Case Study" className="h-11" />
            <WizardNav>
              <Button type="button" onClick={next}>
                Weiter <ArrowRight aria-hidden />
              </Button>
            </WizardNav>
          </WizardStep>
          <WizardStep {...props("date")} title="Wann?">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            <WizardNav onBack={wizard.back}>
              <Button type="button" onClick={next}>
                Weiter <ArrowRight aria-hidden />
              </Button>
            </WizardNav>
          </WizardStep>
          <WizardStep {...props("registration")} title="Mit Anmeldung?">
            <div className="grid gap-3 sm:grid-cols-2">
              <PickTile name="reg" value="ja" required label="Ja" checked={registration === "ja"} onChange={() => { setRegistration("ja"); window.setTimeout(() => wizard.complete("registration"), 200); }} />
              <PickTile name="reg" value="nein" required label="Nein" checked={registration === "nein"} onChange={() => { setRegistration("nein"); window.setTimeout(() => wizard.complete("registration"), 200); }} />
            </div>
            <WizardNav onBack={wizard.back}>
              <Button type="button" variant="outline" onClick={next}>
                Weiter
              </Button>
            </WizardNav>
          </WizardStep>
          <WizardStep {...props("check")} title="Alles richtig?">
            <p className="text-sm text-muted-foreground">Vorschau ohne Speichern.</p>
            <WizardNav onBack={wizard.back}>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Anlegen
              </Button>
            </WizardNav>
          </WizardStep>
        </div>
      </form>
    </WizardDialog>
  );
}
