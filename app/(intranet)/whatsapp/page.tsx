import Image from "next/image";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaHeader, VEREIN_TABS } from "@/components/area/AreaHeader";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { isActiveMemberProfile } from "@/lib/profile-status";

/**
 * Einladungslink nur aus der Server-Umgebung (WHATSAPP_INVITE_URL, ohne NEXT_PUBLIC_):
 * steht weder im Repo noch im Browser-Bundle und wird nur aktiven Mitgliedern gerendert.
 */
function getInviteUrl(): string | null {
  const raw = process.env.WHATSAPP_INVITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "chat.whatsapp.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default async function WhatsAppPage() {
  const { user, profile } = await getCachedAuth();
  if (!user) redirect("/login?next=/whatsapp");

  const inviteUrl = isActiveMemberProfile(profile as Record<string, unknown> | null)
    ? getInviteUrl()
    : null;
  // QR-Code serverseitig aus dem Link erzeugen (kein statisches Bild unter public/).
  const qrDataUrl = inviteUrl
    ? await QRCode.toDataURL(inviteUrl, { margin: 1, width: 288, errorCorrectionLevel: "M" })
    : null;

  return (
    <div className="space-y-8">
      <AreaHeader
        title="Verein"
        tabs={VEREIN_TABS}
        activeKey="whatsapp"
        layoutId="tabs-verein"
        ariaLabel="Bereiche des Vereins"
      />

      <section
        aria-labelledby="whatsapp-titel"
        className="max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-8"
      >
        {inviteUrl && qrDataUrl ? (
          <div className="grid items-center gap-8 md:grid-cols-[auto_minmax(0,1fr)]">
            {/* QR links (Desktop); auf dem Handy unter dem Knopf, dort tippt man eher. */}
            <div className="order-2 mx-auto rounded-2xl border border-border bg-white p-3 md:order-1">
              <Image
                src={qrDataUrl}
                alt="QR-Code zur WhatsApp-Gruppe des Investment Club Regensburg"
                width={288}
                height={288}
                className="size-48 rounded-lg md:size-56"
                unoptimized
              />
            </div>
            <div className="order-1 min-w-0 space-y-5 md:order-2">
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-primary">
                  <MessageCircle className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <h2 id="whatsapp-titel" className="text-xl leading-tight font-bold tracking-[-0.02em]">
                    WhatsApp-Gruppe des ICR
                  </h2>
                  <p className="text-[0.9375rem] text-muted-foreground">Updates und Austausch im Verein.</p>
                </div>
              </div>
              <p className="rounded-xs border border-border bg-background px-3 py-2 text-sm break-all text-muted-foreground select-all">
                {inviteUrl}
              </p>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                  In WhatsApp öffnen
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MessageCircle className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <h2 id="whatsapp-titel" className="text-lg font-bold tracking-[-0.02em]">
                WhatsApp-Gruppe des ICR
              </h2>
              <p className="text-sm text-muted-foreground">
                Der Einladungslink ist gerade nicht verfügbar. Bitte wende dich an den Vorstand.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
