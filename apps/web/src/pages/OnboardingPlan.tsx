import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { FetchError, type Plan, api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { alertNotice } from '../lib/confirm-store';

const MONTHLY_PRICES: Record<string, number> = { pro: 800, ultra: 1800 };

export function OnboardingPlanPage() {
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<'annual' | 'monthly'>('annual');
  const [seats, setSeats] = useState<Record<string, number>>({ pro: 5, ultra: 20 });
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPlans()
      .then((p) => {
        // Cloud onboarding only offers the recurring tiers; the one-time self-host
        // lifetime plans aren't part of the per-seat signup flow.
        setPlans(p.plans.filter((pl) => !pl.features?.self_host));
        setLoading(false);
      })
      // Self-host builds have no billing service — /v1/billing/plans 404s. Skip
      // the plan step entirely instead of hanging on "Loading plans…".
      .catch(() => navigate('/'));
  }, [navigate]);

  if (!token) return null;

  async function handleSelect(planId: string) {
    if (planId === 'free') {
      navigate('/');
      return;
    }
    setUpgrading(planId);
    try {
      const { url } = await api.createCheckout(
        {
          planId,
          interval,
          seats: seats[planId] ?? 1,
          successUrl: `${window.location.origin}/issues?welcome=1`,
          cancelUrl: `${window.location.origin}/onboarding/plan`,
        },
        token,
      );
      if (url) window.location.href = url;
    } catch (err) {
      await alertNotice({ message: err instanceof FetchError ? err.message : 'Failed to start checkout' });
      setUpgrading(null);
    }
  }

  return (
    <AuthLayout>
      <div style={{ width: '100%', maxWidth: 720, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--xp-accent)', textTransform: 'uppercase', marginBottom: 8 }}>
            CHOOSE YOUR PLAN
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--xp-ink)', letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--xp-font-mono)' }}>
            Start with a 30-day free trial
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--xp-muted)', lineHeight: 1.5 }}>
            Every paid plan includes a 30-day trial. No charge until day 31. SSO is free on every plan.
          </p>
        </div>

        <div
          style={{
            display: 'inline-flex',
            border: '1px solid var(--xp-border)',
            borderRadius: 'var(--xp-r-sm)',
            overflow: 'hidden',
            marginBottom: 20,
            alignSelf: 'center',
            width: 'fit-content',
            margin: '0 auto 20px',
          }}
        >
          {(['annual', 'monthly'] as const).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              style={{
                padding: '6px 16px',
                border: 'none',
                background: interval === iv ? 'var(--xp-accent)' : 'transparent',
                color: interval === iv ? 'var(--xp-accent-fg)' : 'var(--xp-muted)',
                fontFamily: 'var(--xp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {iv === 'annual' ? 'Annual (save 25%)' : 'Monthly'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--xp-muted)', textAlign: 'center' }}>Loading plans…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {plans.map((plan) => {
              const displayPrice =
                plan.priceCents === 0
                  ? 0
                  : interval === 'monthly'
                    ? (MONTHLY_PRICES[plan.id] ?? plan.priceCents)
                    : plan.priceCents;
              const isPopular = plan.id === 'pro';
              return (
                <div
                  key={plan.id}
                  style={{
                    border: isPopular ? '2px solid var(--xp-accent-strong)' : '1px solid var(--xp-border)',
                    borderRadius: 'var(--xp-r-md, 8px)',
                    padding: 20,
                    background: 'var(--xp-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    position: 'relative',
                  }}
                >
                  {isPopular && (
                    <div style={{
                      position: 'absolute',
                      top: -1,
                      left: '50%',
                      transform: 'translateX(-50%) translateY(-50%)',
                      background: 'var(--xp-accent)',
                      color: 'var(--xp-accent-fg)',
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: 'var(--xp-font-mono)',
                      letterSpacing: '0.1em',
                      padding: '2px 10px',
                      borderRadius: 4,
                    }}>
                      RECOMMENDED
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-ink)' }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-ink)' }}>
                    {displayPrice === 0 ? 'Free' : `$${displayPrice / 100}`}
                    {displayPrice > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--xp-muted)' }}>
                        /seat/mo
                      </span>
                    )}
                  </div>
                  <ul style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    fontSize: 11,
                    fontFamily: 'var(--xp-font-mono)',
                    color: 'var(--xp-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    flex: 1,
                  }}>
                    <li>✓ {plan.maxUsers === null ? 'Unlimited' : plan.maxUsers} user{plan.maxUsers !== 1 ? 's' : ''}</li>
                    <li>✓ {plan.maxProjects === null ? 'Unlimited' : plan.maxProjects} project{plan.maxProjects !== 1 ? 's' : ''}</li>
                    <li>✓ {plan.maxHarnessKeys >= 2147483647 ? 'Unlimited' : plan.maxHarnessKeys} harness key{plan.maxHarnessKeys !== 1 ? 's' : ''}</li>
                    <li>✓ MCP service</li>
                    {plan.features.sso && <li>✓ SSO included</li>}
                    {plan.features.priority_support && <li>✓ Priority support</li>}
                    {plan.features.sla && <li>✓ SLA guarantee</li>}
                  </ul>

                  {plan.priceCents > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <label style={{ fontSize: 10, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-muted)', whiteSpace: 'nowrap' }}>
                        Seats
                      </label>
                      <input
                        type="number"
                        min={plan.id === 'ultra' ? 20 : 1}
                        max={1000}
                        value={seats[plan.id] ?? 1}
                        onChange={(e) => {
                          const val = Math.max(
                            plan.id === 'ultra' ? 20 : 1,
                            parseInt(e.target.value, 10) || 1,
                          );
                          setSeats((prev) => ({ ...prev, [plan.id]: val }));
                        }}
                        style={{
                          width: 52,
                          padding: '3px 6px',
                          border: '1px solid var(--xp-border)',
                          borderRadius: 'var(--xp-r-sm)',
                          background: 'var(--xp-canvas)',
                          fontFamily: 'var(--xp-font-mono)',
                          fontSize: 11,
                          color: 'var(--xp-ink)',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 10, fontFamily: 'var(--xp-font-mono)', color: 'var(--xp-muted)' }}>
                        = ${((displayPrice / 100) * (seats[plan.id] ?? 1)).toFixed(0)}/mo
                      </span>
                    </div>
                  )}
                  {plan.id === 'ultra' && (
                    <div style={{ fontSize: 9, color: 'var(--xp-faint)', fontFamily: 'var(--xp-font-mono)' }}>
                      20 seat minimum
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={upgrading !== null}
                    onClick={() => handleSelect(plan.id)}
                    style={{
                      marginTop: 8,
                      background: plan.priceCents > 0 ? 'var(--xp-accent)' : 'transparent',
                      border: plan.priceCents > 0 ? '1px solid transparent' : '1px solid var(--xp-border)',
                      borderRadius: 'var(--xp-r-sm)',
                      color: plan.priceCents > 0 ? 'var(--xp-accent-fg)' : 'var(--xp-muted)',
                      cursor: upgrading ? 'default' : 'pointer',
                      fontFamily: 'var(--xp-font-mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '8px 16px',
                      opacity: upgrading === plan.id ? 0.6 : 1,
                      width: '100%',
                    }}
                  >
                    {upgrading === plan.id
                      ? 'REDIRECTING…'
                      : plan.priceCents === 0
                        ? 'CONTINUE FREE'
                        : 'START 30-DAY TRIAL'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: 'var(--xp-faint)', fontFamily: 'var(--xp-font-mono)', letterSpacing: '0.06em' }}>
          ALL PLANS INCLUDE SSO · NO CHARGE UNTIL DAY 31 · CANCEL ANYTIME
        </p>
      </div>
    </AuthLayout>
  );
}
