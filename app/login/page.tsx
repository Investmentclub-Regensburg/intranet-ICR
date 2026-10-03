import Link from "next/link";
import Image from "next/image";
import { LoginForm } from "./login-form";
import { safeNextPath } from "@/lib/safe-redirect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next) ?? undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/icr-logo.png"
            alt="ICR Regensburg Logo"
            width={64}
            height={64}
            className="h-16 w-16 rounded-xl bg-white p-1 shadow-sm"
            priority
          />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
              Willkommen im ICR Intranet
            </h1>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Anmelden</CardTitle>
              <CardDescription>
                Melde dich mit deiner ICR-E-Mail-Adresse und deinem Passwort an.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm next={next} />
              <p className="mt-4 text-center text-sm text-muted-foreground">
                <Link
                  href="/forgot-password"
                  className="font-medium text-primary hover:underline"
                >
                  Passwort vergessen?
                </Link>
              </p>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Noch kein Konto?{" "}
                <Link href="/register" className="font-medium text-primary hover:underline">
                  Jetzt registrieren
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
