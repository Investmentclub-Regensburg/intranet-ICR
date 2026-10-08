import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthFrame, StageHeading } from "@/components/auth/AuthFrame";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthFrame stage={<StageHeading eyebrow="Mitglieder-Intranet" title="Passwort vergessen" />}>
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Gib deine E-Mail ein. Wir schicken dir einen Link zum Zurücksetzen
          des Passworts.
        </p>
        <ForgotPasswordForm />
        <div className="border-t border-border pt-6 text-sm">
          <Link
            href="/login"
            className="group inline-flex items-center gap-1.5 font-semibold text-primary transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" aria-hidden />
            Zurück zum Login
          </Link>
        </div>
      </div>
    </AuthFrame>
  );
}
