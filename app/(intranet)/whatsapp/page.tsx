import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          WhatsApp Gruppe
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Tritt der offiziellen Investment Club Regensburg WhatsApp-Gruppe bei,
          um Updates und Austausch im Verein direkt mitzubekommen.
        </p>
      </div>

      <Card>
        <CardHeader className="items-center text-center">
          <Image
            src="/whatsapp-logo.png"
            alt="WhatsApp Logo"
            width={180}
            height={180}
            className="h-16 w-16"
            priority
          />
          <CardTitle>Investment Club Regensburg</CardTitle>
          <CardDescription>Offizielle WhatsApp-Gruppe des ICR</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {inviteUrl && qrDataUrl ? (
            <>
              <div className="rounded-2xl border bg-white p-4">
                <Image
                  src={qrDataUrl}
                  alt="QR-Code zur WhatsApp-Gruppe des Investment Club Regensburg"
                  width={288}
                  height={288}
                  className="h-auto w-64 rounded-lg md:w-72"
                  unoptimized
                />
              </div>

              <div className="flex w-full max-w-md flex-col gap-3 text-center">
                <p className="break-all rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {inviteUrl}
                </p>
                <Button asChild className="w-full">
                  <Link
                    href={inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Gruppe in WhatsApp öffnen
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="max-w-md text-center text-sm text-muted-foreground">
              Der Einladungslink ist derzeit nicht verfügbar. Bitte wende dich an den Vorstand.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
