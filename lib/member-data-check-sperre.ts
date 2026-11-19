/**
 * Sperre der Abfrage „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4, Gegenprüfung S-G1).
 *
 * Next rendert die Seite eines Segments parallel zum Layout und überträgt sie als eigenen Eintrag im RSC-Payload,
 * auch wenn das Layout mit `redirect()` abbricht. Bei einer Navigation, deren `Next-Router-State-Tree` das Layout
 * als geladen meldet, läuft das Layout gar nicht. Die Weiterleitung im Intranet-Layout allein hält den Seiteninhalt
 * deshalb nicht aus der Antwort. Darum ruft jede `page.tsx` (und jedes `generateMetadata`) unter `app/(intranet)`
 * als erste Anweisung `sperreBeiDatenmaengeln()` auf (Prüfregel in tests/intranet-sperre.test.mjs).
 *
 * Kosten: Ist die Abfrage abgeschaltet (DATA_CHECK_ENABLED), endet die Sperre sofort, ohne Anmeldung oder Datenbank.
 * Sonst ist `eigenerDatenCheck` per `cache()` je Anfrage einmal berechnet und von Layout, Seiten, Metadaten und
 * /daten-bestaetigen geteilt. Die Fälligkeit kommt aus `getCachedAuth` (keine zusätzliche Datenbankanfrage);
 * entschlüsselt wird nur bei fälliger Abfrage und dann genau einmal je Anfrage.
 *
 * Server-Actions und API-Routen anderer Seiten bleiben technisch aufrufbar: Das Mitglied ist dafür ohnehin
 * berechtigt, es geht um die Datenqualität, nicht um Vertraulichkeit. Nur Server.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { createServiceClient } from "@/utils/supabase/service";
import { DATEN_CHECK_PFAD, type DatenCheckAnsicht } from "./member-data-check";
import { datenCheckEinstellungen, faelligerDatenCheck } from "./member-data-check-server";

/** Fenster-Daten des angemeldeten Mitglieds, falls die Abfrage fällig ist (sonst null). Einmal je Anfrage. */
export const eigenerDatenCheck = cache(async (): Promise<DatenCheckAnsicht | null> => {
  if (!datenCheckEinstellungen().eingeschaltet) return null;
  const { user, profile, datenCheckSpalten } = await getCachedAuth();
  if (!user) return null;
  return faelligerDatenCheck({
    profil: profile,
    email: user.email ?? ((profile?.["E-Mail"] as string | null) ?? ""),
    spalten: datenCheckSpalten,
    admin: createServiceClient,
  });
});

/**
 * Fällig und ungültig → Weiterleitung auf DATEN_CHECK_PFAD (wirft, wie `redirect`). Sonst nichts. Erste Anweisung
 * jeder Intranet-Seite, damit von der Seite nichts gerendert wird. Ohne Anmeldung tut sie nichts (das regeln
 * middleware.ts und das Layout).
 */
export const sperreBeiDatenmaengeln = cache(async (): Promise<void> => {
  const datenCheck = await eigenerDatenCheck();
  if (datenCheck && !datenCheck.gueltig) redirect(DATEN_CHECK_PFAD);
});
