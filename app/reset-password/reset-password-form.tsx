"use client";

import { useActionState, useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/kit/PasswordInput";
import { Label } from "@/components/ui/label";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {
  error: "",
  redirect: undefined,
};

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.redirect) {
      router.push(state.redirect);
      router.refresh();
    }
  }, [state.redirect, router]);

  const checkMatch = useCallback((newPwd: string, confirmPwd: string) => {
    const mismatch =
      confirmPwd.length > 0 && newPwd.length > 0 && newPwd !== confirmPwd;
    setPasswordMismatch(mismatch);
    confirmRef.current?.setCustomValidity(
      mismatch ? "Passwörter stimmen nicht überein." : ""
    );
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="newPassword">Neues Passwort</Label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Mind. 6 Zeichen"
          className="h-11"
          onChange={(e) =>
            checkMatch(e.target.value, confirmRef.current?.value ?? "")
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
        <PasswordInput
          ref={confirmRef}
          id="confirmPassword"
          name="confirmPassword"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Passwort wiederholen"
          className={passwordMismatch ? "h-11 border-destructive" : "h-11"}
          aria-invalid={passwordMismatch}
          aria-describedby={passwordMismatch ? "confirm-error" : undefined}
          onChange={(e) => {
            const newPwd = (
              document.getElementById("newPassword") as HTMLInputElement
            )?.value;
            checkMatch(newPwd ?? "", e.target.value);
          }}
        />
        {passwordMismatch && (
          <p id="confirm-error" className="text-sm text-destructive" role="alert">
            Die Passwörter stimmen nicht überein.
          </p>
        )}
      </div>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full">
        Neues Passwort speichern
      </Button>
    </form>
  );
}
