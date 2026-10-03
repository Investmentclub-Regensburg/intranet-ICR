"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

const initialState = { error: "", redirect: undefined as string | undefined };

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.redirect) {
      router.push(state.redirect);
      router.refresh();
    }
  }, [state.redirect, router]);

  return (
    <form action={formAction} className="space-y-4">
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
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full">
        Anmelden
      </Button>
    </form>
  );
}
