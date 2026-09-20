"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  updateProfile,
  type AlumniRequestStatus,
  type ProfileActionState,
} from "@/app/(intranet)/profile/actions";
import { AlumniRequestButton } from "@/components/profile/AlumniRequestButton";

type ProfileData = {
  vorname: string;
  nachname: string;
  email: string;
  rolle: string;
  status: string;
  datumAntrag: string | null;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  mobil: string;
  iban: string;
  bic: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  alumni: "Alumni",
  board: "Vorstand",
  member: "Mitglied",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Aktiv",
  applicant: "Bewerber",
  inactive: "Inaktiv",
};

function formatDate(iso: string | null): string {
  if (!iso) return "\u2013";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2013";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function membershipDuration(iso: string | null): string {
  if (!iso) return "";
  const joined = new Date(iso);
  if (Number.isNaN(joined.getTime())) return "";

  const now = new Date();
  let years = now.getFullYear() - joined.getFullYear();
  let months = now.getMonth() - joined.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "Jahr" : "Jahre"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "Monat" : "Monate"}`);

  return parts.length > 0 ? `(${parts.join(", ")})` : "(< 1 Monat)";
}

function roleBadgeVariant(rolle: string) {
  if (rolle === "admin") return "destructive" as const;
  if (rolle === "board") return "default" as const;
  return "secondary" as const;
}

function statusBadgeVariant(status: string) {
  if (status === "active") return "default" as const;
  if (status === "applicant") return "outline" as const;
  return "secondary" as const;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Speichern..." : "Änderungen speichern"}
    </Button>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="rounded-md border border-transparent bg-muted/50 px-3 py-2 text-sm">
        {value || "\u2013"}
      </p>
    </div>
  );
}

const INITIAL_STATE: ProfileActionState = { success: false, error: "" };

export function ProfileForm({
  profile,
  alumniRequestStatus = "none",
}: {
  profile: ProfileData;
  alumniRequestStatus?: AlumniRequestStatus;
}) {
  const [state, formAction] = useActionState(updateProfile, INITIAL_STATE);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let timeoutId: number | undefined;

    if (state.success) {
      toast.success("Profil erfolgreich gespeichert.");
      timeoutId = window.setTimeout(() => {
        setEditing(false);
      }, 0);
    } else if (state.error) {
      toast.error(state.error);
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [state]);

  const roleLabel = ROLE_LABELS[profile.rolle] ?? profile.rolle;
  const statusLabel = STATUS_LABELS[profile.status] ?? profile.status;

  return (
    <div className="space-y-6">
      {/* Card 1: ICR Akte (Read-Only) */}
      <Card>
        <CardHeader>
          <CardTitle>ICR Akte</CardTitle>
          <CardDescription>
            Deine Vereinsdaten &ndash; diese werden vom Vorstand verwaltet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium">
                {profile.vorname} {profile.nachname}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">E-Mail</dt>
              <dd className="text-sm">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Rolle</dt>
              <dd>
                <Badge variant={roleBadgeVariant(profile.rolle)}>
                  {roleLabel}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={statusBadgeVariant(profile.status)}>
                  {statusLabel}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Mitglied seit
              </dt>
              <dd className="text-sm">
                {formatDate(profile.datumAntrag)}{" "}
                <span className="text-muted-foreground">
                  {membershipDuration(profile.datumAntrag)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Alumni-Status
              </dt>
              <dd className="mt-1">
                <AlumniRequestButton
                  initialStatus={alumniRequestStatus}
                  rolle={profile.rolle}
                  status={profile.status}
                />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Card 2: Stammdaten & Bankverbindung */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="space-y-1.5">
            <CardTitle>Stammdaten & Bankverbindung</CardTitle>
            <CardDescription>
              {editing
                ? "Felder bearbeiten und speichern."
                : "Klicke auf Bearbeiten, um deine Daten zu ändern."}
            </CardDescription>
          </div>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="shrink-0 gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Bearbeiten
            </Button>
          )}
          {editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              className="shrink-0 gap-1.5 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Abbrechen
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <form action={formAction} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="strasse">Straße</Label>
                  <Input
                    id="strasse"
                    name="strasse"
                    defaultValue={profile.strasse}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hausnummer">Hausnummer</Label>
                  <Input
                    id="hausnummer"
                    name="hausnummer"
                    defaultValue={profile.hausnummer}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plz">PLZ</Label>
                  <Input id="plz" name="plz" defaultValue={profile.plz} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ort">Ort</Label>
                  <Input id="ort" name="ort" defaultValue={profile.ort} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mobil">Handynummer</Label>
                  <Input
                    id="mobil"
                    name="mobil"
                    type="tel"
                    defaultValue={profile.mobil}
                  />
                </div>
              </div>

              <hr className="border-border" />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    name="iban"
                    defaultValue={profile.iban}
                    className="font-mono text-sm tracking-wide"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bic">BIC</Label>
                  <Input
                    id="bic"
                    name="bic"
                    defaultValue={profile.bic}
                    className="font-mono text-sm tracking-wide"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <SubmitButton />
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="Straße" value={profile.strasse} />
                <ReadOnlyField label="Hausnummer" value={profile.hausnummer} />
                <ReadOnlyField label="PLZ" value={profile.plz} />
                <ReadOnlyField label="Ort" value={profile.ort} />
                <div className="sm:col-span-2">
                  <ReadOnlyField label="Handynummer" value={profile.mobil} />
                </div>
              </div>

              <hr className="border-border" />

              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="IBAN" value={profile.iban} />
                <ReadOnlyField label="BIC" value={profile.bic} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
