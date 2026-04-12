"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { useParticipant } from "@/hooks/useParticipant";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ZelligePattern } from "@/components/ui/ZelligePattern";
import { toast } from "sonner";
import {
  Heart,
  Landmark,
  Building2,
  Briefcase,
  HandHelping,
  ArrowRight,
  ArrowLeft,
  Wallet,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const roles = [
  {
    id: 2,
    key: "donor",
    label: "Donor",
    icon: Heart,
    color: "text-status-red",
    bg: "bg-status-red/10",
    border: "border-status-red/30",
    description: "Contribute funds or in-kind items to active crises",
  },
  {
    id: 0,
    key: "go",
    label: "Government Organization",
    icon: Landmark,
    color: "text-openaid-deep-blue",
    bg: "bg-openaid-deep-blue/10",
    border: "border-openaid-deep-blue/30",
    description: "Declare crises, verify participants, govern the system",
    note: "GO registration requires admin privileges",
  },
  {
    id: 1,
    key: "ngo",
    label: "NGO",
    icon: Building2,
    color: "text-status-green",
    bg: "bg-status-green/10",
    border: "border-status-green/30",
    description: "Run for coordinator, distribute aid, manage exchange centers",
  },
  {
    id: 4,
    key: "company",
    label: "Private Company",
    icon: Briefcase,
    color: "text-status-amber",
    bg: "bg-status-amber/10",
    border: "border-status-amber/30",
    description: "Corporate CSR donations — transparent and verifiable",
  },
  {
    id: 3,
    key: "beneficiary",
    label: "Beneficiary",
    icon: HandHelping,
    color: "text-openaid-blue",
    bg: "bg-openaid-blue/10",
    border: "border-openaid-blue/30",
    description: "Receive humanitarian aid and confirm delivery",
  },
];

type Step = "select" | "connect" | "register" | "done";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-openaid-cream flex items-center justify-center text-openaid-dim-text">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselected = searchParams.get("role");

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { participant } = useParticipant();

  const [selectedRole, setSelectedRole] = useState<typeof roles[number] | null>(
    () => roles.find((r) => r.key === preselected) ?? null
  );
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>(preselected ? "connect" : "select");

  // Registration contract calls
  const { writeAsync: registerParticipant, isPending: regPending } = useScaffoldContractWrite({
    contractName: "Registry",
    functionName: "registerParticipant",
  });

  const { writeAsync: registerNGO, isPending: ngoPending } = useScaffoldContractWrite({
    contractName: "Registry",
    functionName: "registerNGO",
  });

  const isPending = regPending || ngoPending;

  // If already registered, redirect
  if (participant?.isRegistered && step !== "done") {
    const roleRoutes: Record<string, string> = {
      Donor: "/dashboard/donor",
      Beneficiary: "/dashboard/beneficiary",
      NGO: "/dashboard/ngo",
      GO: "/dashboard/go",
      PrivateCompany: "/dashboard/donor",
    };
    router.replace(roleRoutes[participant.role] ?? "/dashboard");
    return null;
  }

  const handleSelectRole = (role: typeof roles[number]) => {
    setSelectedRole(role);
    setStep(isConnected ? "register" : "connect");
  };

  const handleConnect = () => {
    if (connectors[0]) {
      connect({ connector: connectors[0] });
    }
  };

  const handleRegister = async () => {
    if (!selectedRole || !name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    try {
      if (selectedRole.id === 1) {
        // NGO self-registration
        await registerNGO([name.trim()]);
      } else if (selectedRole.id === 0) {
        toast.error("GO registration requires admin. Contact the system administrator.");
        return;
      } else {
        // Donor, Beneficiary, PrivateCompany
        await registerParticipant([BigInt(selectedRole.id), name.trim()]);
      }
      setStep("done");
      toast.success("Registration successful!");
    } catch {
      // Error already toasted by useScaffoldContractWrite
    }
  };

  return (
    <div className="min-h-screen bg-openaid-cream relative overflow-hidden">
      <ZelligePattern variant="light" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-openaid-border bg-openaid-cream/80 backdrop-blur-sm">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/OpenIAD.png" alt="OpenAID" width={28} height={28} className="rounded" />
          <span className="font-semibold text-sm">
            <span className="text-[#E84C3D]">OpenAID</span>{" "}
            <span className="text-[#2D6A4F]">+212</span>
          </span>
        </Link>
        {step !== "select" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(step === "register" ? "connect" : "select")}
            className="gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        )}
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Step 1: Select role */}
        {step === "select" && (
          <div>
            <div className="text-center mb-10">
              <h1 className="text-3xl font-display font-bold text-openaid-black">Choose Your Role</h1>
              <p className="text-openaid-dim-text mt-2">Select how you want to participate in the OpenAID ecosystem</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((role) => (
                <Card
                  key={role.key}
                  className={`bg-openaid-card-bg border-openaid-border p-5 cursor-pointer hover:shadow-md hover:${role.border} transition-all`}
                  onClick={() => handleSelectRole(role)}
                >
                  <div className={`w-11 h-11 rounded-xl ${role.bg} flex items-center justify-center mb-3`}>
                    <role.icon className={`w-5 h-5 ${role.color}`} />
                  </div>
                  <h3 className="font-semibold text-openaid-black mb-1">{role.label}</h3>
                  <p className="text-xs text-openaid-dim-text leading-relaxed">{role.description}</p>
                  {role.note && (
                    <p className="text-[10px] text-status-amber mt-2">{role.note}</p>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Connect wallet */}
        {step === "connect" && (
          <div className="max-w-md mx-auto text-center">
            <div className={`w-16 h-16 rounded-2xl ${selectedRole?.bg} flex items-center justify-center mx-auto mb-6`}>
              {selectedRole && <selectedRole.icon className={`w-8 h-8 ${selectedRole.color}`} />}
            </div>
            <h2 className="text-2xl font-display font-bold text-openaid-black mb-2">Connect Your Wallet</h2>
            <p className="text-openaid-dim-text mb-8">
              Registering as <strong>{selectedRole?.label}</strong>. Connect your wallet to continue.
            </p>

            {isConnected ? (
              <div className="space-y-4">
                <div className="bg-openaid-card-bg border border-openaid-border rounded-xl p-4">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-status-green" />
                    <span className="font-mono text-sm text-openaid-black">
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
                  onClick={() => setStep("register")}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => disconnect()} className="text-openaid-mid-gray">
                  Use a different wallet
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                className="w-full bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
                onClick={handleConnect}
              >
                <Wallet className="w-5 h-5" /> Connect Wallet
              </Button>
            )}
          </div>
        )}

        {/* Step 3: Register details */}
        {step === "register" && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-display font-bold text-openaid-black">Complete Registration</h2>
              <p className="text-openaid-dim-text mt-1">
                Registering as <strong>{selectedRole?.label}</strong>
              </p>
            </div>

            <Card className="bg-openaid-card-bg border-openaid-border p-6 space-y-5">
              <div>
                <Label htmlFor="wallet" className="text-xs text-openaid-mid-gray">Wallet Address</Label>
                <div className="mt-1 font-mono text-sm text-openaid-black bg-white/60 border border-openaid-border rounded-lg px-3 py-2">
                  {address?.slice(0, 10)}...{address?.slice(-8)}
                </div>
              </div>

              <div>
                <Label htmlFor="name" className="text-xs text-openaid-mid-gray">
                  {selectedRole?.id === 1 ? "Organization Name" : "Display Name"}
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedRole?.id === 1 ? "e.g. Morocco Relief Fund" : "e.g. Ahmed Benali"}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs text-openaid-mid-gray">Role</Label>
                <div className="mt-1 flex items-center gap-2">
                  {selectedRole && (
                    <>
                      <div className={`w-8 h-8 rounded-lg ${selectedRole.bg} flex items-center justify-center`}>
                        <selectedRole.icon className={`w-4 h-4 ${selectedRole.color}`} />
                      </div>
                      <span className="text-sm font-medium text-openaid-black">{selectedRole.label}</span>
                    </>
                  )}
                </div>
              </div>

              <Button
                className="w-full bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2 mt-4"
                onClick={handleRegister}
                disabled={isPending || !name.trim()}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Registering...
                  </>
                ) : (
                  <>
                    Register on Blockchain <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <p className="text-[10px] text-openaid-mid-gray text-center">
                This will send a transaction to the Registry smart contract
              </p>
            </Card>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && (
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-status-green/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-status-green" />
            </div>
            <h2 className="text-2xl font-display font-bold text-openaid-black mb-2">
              Registration Complete!
            </h2>
            <p className="text-openaid-dim-text mb-8">
              You are now registered as <strong>{selectedRole?.label}</strong> on the OpenAID +212 blockchain.
            </p>
            <Button
              size="lg"
              className="bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
