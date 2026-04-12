"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CrisisSelectorProps {
  crisisId: number;
  crisisCount: number;
  onChange: (id: number) => void;
}

export function CrisisSelector({ crisisId, crisisCount, onChange }: CrisisSelectorProps) {
  const count = Math.max(crisisCount, 1);

  return (
    <Select
      value={String(crisisId)}
      onValueChange={(v) => onChange(Number(v))}
    >
      <SelectTrigger className="w-[180px] bg-openaid-card-bg border-openaid-border text-sm">
        <SelectValue placeholder="Select crisis" />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: count }, (_, i) => i + 1).map((id) => (
          <SelectItem key={id} value={String(id)}>
            Crisis #{id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
