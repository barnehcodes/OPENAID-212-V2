"use client";

import {
  Navbar,
  NewsTicker,
  HeroSection,
  LiveStats,
  CrisisTimeline,
  HowItWorks,
  RoleCards,
  ZeroTrust,
  CTAFooter,
} from "@/components/landing";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-16">
        <NewsTicker />
      </div>
      <HeroSection />
      <LiveStats />
      <CrisisTimeline />
      <HowItWorks />
      <RoleCards />
      <ZeroTrust />
      <CTAFooter />
    </div>
  );
}
