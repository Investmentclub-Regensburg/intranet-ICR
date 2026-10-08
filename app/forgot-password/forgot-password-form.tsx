"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {
  error: "",
  success: false,
  email: "",
};

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);

  if (state.success) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <p className="font-medium text-foreground">E-Mail zum Zurücksetzen gesendet</p>
          <p className="text-sm text-muted-foreground">
            Falls ein Konto mit dieser E-Mail existiert, findest du in Kürze eine
            Nachricht mit einem Link zum Zurücksetzen deines Passworts.
          </p>
        </div>
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="email" value={state.email ?? ""} readOnly />
          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="outline" size="lg" className="w-full">
            E-Mail erneut senden
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
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
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full">
        Reset-Link senden
      </Button>
    </form>
  );
}
