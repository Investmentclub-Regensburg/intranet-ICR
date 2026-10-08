import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthFrame, StageHeading } from "@/components/auth/AuthFrame";
import { createClient } from "@/utils/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AuthFrame stage={<StageHeading title="Neues Passwort vergeben" />}>
      <div className="fly-stack space-y-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Gib dein neues Passwort ein und bestätige es. Danach wirst du zum
          Dashboard weitergeleitet.
        </p>
        <ResetPasswordForm />
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
