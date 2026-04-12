interface AddressBadgeProps {
  address: string;
  className?: string;
}

export function AddressBadge({ address, className = "" }: AddressBadgeProps) {
  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "0x0000...0000";

  return (
    <span
      className={`font-mono text-xs bg-openaid-card-bg px-2 py-1 rounded border border-openaid-border text-openaid-dim-text ${className}`}
      title={address}
    >
      {truncated}
    </span>
  );
}
