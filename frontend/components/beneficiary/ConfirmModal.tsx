"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  titleAr?: string;
  description: string;
  onConfirm: () => Promise<void>;
  isPending: boolean;
  showNftInput?: boolean;
  nftId?: number;
  onNftIdChange?: (id: number) => void;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  titleAr,
  description,
  onConfirm,
  isPending,
  showNftInput,
  nftId,
  onNftIdChange,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {titleAr && (
            <p className="text-sm text-openaid-mid-gray" dir="rtl">{titleAr}</p>
          )}
          <DialogDescription className="mt-2">{description}</DialogDescription>
        </DialogHeader>

        {/* Permanence warning */}
        <div className="bg-status-amber/10 border border-status-amber/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-status-amber flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-status-amber">This cannot be undone</p>
            <p className="text-xs text-openaid-dim-text mt-1">
              Once confirmed, this action is permanently recorded on the blockchain.
            </p>
            <p className="text-xs text-openaid-mid-gray mt-1" dir="rtl">
              هذا الإجراء لا يمكن التراجع عنه
            </p>
          </div>
        </div>

        {showNftInput && (
          <div>
            <Label className="text-xs text-openaid-mid-gray">Item ID (NFT Token ID)</Label>
            <Input
              type="number"
              min="0"
              value={nftId ?? 0}
              onChange={(e) => onNftIdChange?.(Number(e.target.value))}
              className="mt-1"
              placeholder="Enter the item token ID"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-status-green hover:bg-status-green/90 text-white gap-2 min-h-[48px]"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Yes, I confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
