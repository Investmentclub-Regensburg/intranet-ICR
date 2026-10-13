import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LoginForm } from "./login-form";
import { safeNextPath } from "@/lib/safe-redirect";
import { AuthFrame, StageHeading } from "@/components/auth/AuthFrame";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next) ?? undefined;
  const emailPending = params.email === "ausstehend";

  return (
    <AuthFrame
      stage={<StageHeading title={["Willkommen", "im ICR-Intranet"]} />}
    >
      <div className="fly-stack space-y-8">
        <h2 className="text-2xl font-bold tracking-[-0.03em]">Anmelden</h2>
        {emailPending && (
          <p role="status" className="rounded-xl border border-border bg-muted/60 p-4 text-sm leading-relaxed">
            Danke, ein Link ist bestätigt. Bitte bestätige die Änderung deiner E-Mail-Adresse auch über den Link, den
            wir an deine andere Adresse geschickt haben.
          </p>
        )}
        <LoginForm next={next} />
        <div className="border-t border-border pt-6 text-sm text-muted-foreground">
          Noch kein Konto?{" "}
          <Link
            href="/register"
            className="group inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-foreground"
          >
            Jetzt registrieren
            <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </AuthFrame>
  );
}
