"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Users, Calendar, CheckCircle } from "lucide-react";
import {
  monthlyTotalCents,
  perSeatCents,
  SOLO_PRICE_PER_SEAT_CENTS,
  TEAM_MAX_SEATS,
  TEAM_PRICE_PER_SEAT_CENTS,
  tierForSeats,
} from "@/lib/constants";

const dollars = (cents: number) => (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

function BillingContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/subscription")
      .then((r) => r.json())
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCheckout() {
    const res = await fetch("/api/admin/billing/checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  async function handleManageBilling() {
    const res = await fetch("/api/admin/billing/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  const seats = subscription?.seats || 1;
  const tier = tierForSeats(seats);
  const tierLabel = tier === "SOLO" ? "Solo" : "Team";

  const statusColors: Record<string, string> = {
    TRIALING: "bg-blue-100 text-blue-800",
    ACTIVE: "bg-green-100 text-green-800",
    PAST_DUE: "bg-red-100 text-red-800",
    CANCELED: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-6">
      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5" /> Subscription activated! Thank you.
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription?.isComp && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                  Your workspace is on a <strong>complimentary plan</strong> —
                  no billing required. All features stay unlocked.
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                {subscription?.isComp ? (
                  <Badge className="bg-emerald-100 text-emerald-800">COMPLIMENTARY</Badge>
                ) : (
                  <Badge className={statusColors[subscription?.status || "TRIALING"]}>
                    {subscription?.status || "TRIALING"}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Seats
                </span>
                <span className="font-semibold">{seats}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Plan</span>
                <span className="font-semibold">
                  {tierLabel} &middot; ${dollars(perSeatCents(seats))}/seat/mo
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Monthly Cost</span>
                <span className="font-semibold">${dollars(monthlyTotalCents(seats))}/mo</span>
              </div>
              {subscription?.trialEndsAt && subscription.status === "TRIALING" && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Trial Ends
                  </span>
                  <span>{new Date(subscription.trialEndsAt).toLocaleDateString()}</span>
                </div>
              )}
              {subscription?.currentPeriodEnd && subscription.status === "ACTIVE" && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Next Billing</span>
                  <span>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {!subscription?.isComp && (
            <div className="flex gap-2">
              {(!subscription?.stripeSubscriptionId ||
                subscription?.status === "TRIALING") && (
                <Button onClick={handleCheckout} className="flex-1">
                  {subscription?.status === "TRIALING"
                    ? "Add Payment Method"
                    : "Subscribe Now"}
                </Button>
              )}
              {subscription?.stripeSubscriptionId &&
                !subscription.stripeCustomerId.startsWith("pending_") && (
                  <Button variant="outline" onClick={handleManageBilling} className="flex-1">
                    Manage Subscription
                  </Button>
                )}
            </div>
          )}

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Pricing</h3>
              <p className="text-gray-600 text-sm">
                Solo: ${dollars(SOLO_PRICE_PER_SEAT_CENTS)}/seat/month (1 seat).{" "}
                Team: ${dollars(TEAM_PRICE_PER_SEAT_CENTS)}/seat/month ({`2–${TEAM_MAX_SEATS}`} seats).{" "}
                5-day trial included (credit card required). Add or remove seats any time from the Team page —
                crossing from 1 to 2 seats moves you to the Team plan automatically.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="h-48 bg-gray-100 rounded-lg animate-pulse" />}>
      <BillingContent />
    </Suspense>
  );
}
