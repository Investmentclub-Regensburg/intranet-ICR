"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/kit/PasswordInput";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

const initialState = { error: "", redirect: undefined as string | undefined };

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.redirect) {
      router.push(state.redirect);
      router.refresh();
    }
  }, [state.redirect, router]);

  return (
    <form action={formAction} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="name@beispiel.de"
          required
          autoComplete="email"
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Passwort</Label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
          >
            Passwort vergessen?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
          className="h-11"
        />
      </div>
      {state.error && (
        <p className="rounded-xs border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Anmelden …" : "Anmelden"}
      </Button>
    </form>
  );
}
