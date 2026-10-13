"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMemberRole, type AdminMemberRow } from "@/app/(intranet)/admin/members/actions";

const ROLE_LABELS: Record<string, string> = {
  member: "Mitglied",
  admin: "Admin",
  board: "Vorstand",
  alumni: "Alumni",
  cancelled: "Ausgetreten",
};

function selectValueForMember(m: AdminMemberRow): string {
  if (m.status === "cancelled") return "cancelled";
  return m.rolle || "member";
}

function selectValueForStatus(status: string, rolle: string): string {
  if (status === "cancelled") return "cancelled";
  return rolle || "member";
}

type Props = {
  member: AdminMemberRow;
};

export function MemberRoleSelect({ member }: Props) {
  const [value, setValue] = useState(() => selectValueForMember(member));
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { id, status, rolle } = member;

  // Auswahl an neue Server-Daten angleichen (State während des Renderns anpassen statt im Effect).
  const propsKey = `${id}|${status}|${rolle}`;
  const [syncedKey, setSyncedKey] = useState(propsKey);
  if (syncedKey !== propsKey) {
    setSyncedKey(propsKey);
    setValue(selectValueForStatus(status, rolle));
  }

  async function handleChange(newRole: string) {
    setLoading(true);
    try {
      const { error } = await updateMemberRole(member.id, newRole);
      if (error) toast.error(error);
      else {
        setValue(newRole);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Select
      value={value || "member"}
      onValueChange={handleChange}
      disabled={loading}
    >
      <SelectTrigger className="w-[160px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">{ROLE_LABELS.member}</SelectItem>
        <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
        <SelectItem value="board">{ROLE_LABELS.board}</SelectItem>
        <SelectItem value="alumni">{ROLE_LABELS.alumni}</SelectItem>
        <SelectItem value="cancelled">{ROLE_LABELS.cancelled}</SelectItem>
      </SelectContent>
    </Select>
  );
}
