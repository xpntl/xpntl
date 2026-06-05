const BRAND = {
  bg: '#161210',
  surface: '#1e1a17',
  border: '#2a2520',
  ink: '#ECE6DA',
  muted: '#9a9080',
  accent: '#F3CB00',
  accentStrong: '#BC9200',
  mono: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
};

function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.mono};color:${BRAND.ink};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};">
<tr><td align="center" style="padding:48px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;">
<tr><td style="padding:40px;">
${body}
<tr><td style="padding:0 40px 32px;">
<p style="margin:0;font-size:11px;color:${BRAND.muted};letter-spacing:0.05em;">
XPNTL · close the gap.<br>
This is a transactional message from xpntl.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Billing Templates ──

export function welcomeEmail(opts: { workspaceName: string; plan: string }): { subject: string; html: string; text: string } {
  const html = layout(`
<p style="margin:0 0 8px;font-size:11px;color:${BRAND.muted};letter-spacing:0.1em;text-transform:uppercase;">WELCOME</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.02em;">Your workspace is live.</h1>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
<strong style="color:${BRAND.ink};">${opts.workspaceName}</strong> is set up on the <strong style="color:${BRAND.accent};">${opts.plan}</strong> plan. Invite your team, create your first project, and start shipping.
</p>
<a href="https://app.xpntl.dev" style="display:block;text-align:center;padding:12px;background:${BRAND.accent};color:#180F09;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;">OPEN WORKSPACE</a>
</td></tr>
`);

  const text = `Welcome to xpntl!

Your workspace "${opts.workspaceName}" is live on the ${opts.plan} plan.

Open your workspace: https://app.xpntl.dev

— xpntl · close the gap.`;

  return { subject: `Welcome to xpntl — ${opts.workspaceName} is live`, html, text };
}

export function invoiceEmail(opts: {
  workspaceName: string;
  amount: string;
  period: string;
  invoiceUrl: string;
}): { subject: string; html: string; text: string } {
  const html = layout(`
<p style="margin:0 0 8px;font-size:11px;color:${BRAND.muted};letter-spacing:0.1em;text-transform:uppercase;">INVOICE</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.02em;">Payment received.</h1>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
Your payment for <strong style="color:${BRAND.ink};">${opts.workspaceName}</strong> has been processed.
</p>
<div style="background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:8px;padding:16px;margin:0 0 24px;">
<table width="100%" style="font-size:13px;color:${BRAND.muted};">
<tr><td>Amount</td><td style="text-align:right;color:${BRAND.ink};font-weight:600;">${opts.amount}</td></tr>
<tr><td style="padding-top:8px;">Period</td><td style="padding-top:8px;text-align:right;color:${BRAND.ink};">${opts.period}</td></tr>
</table>
</div>
<a href="${opts.invoiceUrl}" style="display:block;text-align:center;padding:12px;background:${BRAND.accent};color:#180F09;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;">VIEW INVOICE</a>
</td></tr>
`);

  const text = `Payment received for ${opts.workspaceName}

Amount: ${opts.amount}
Period: ${opts.period}

View invoice: ${opts.invoiceUrl}

— xpntl · close the gap.`;

  return { subject: `Invoice for ${opts.workspaceName} — ${opts.amount}`, html, text };
}

export function upgradeEmail(opts: {
  workspaceName: string;
  oldPlan: string;
  newPlan: string;
}): { subject: string; html: string; text: string } {
  const html = layout(`
<p style="margin:0 0 8px;font-size:11px;color:${BRAND.muted};letter-spacing:0.1em;text-transform:uppercase;">PLAN UPGRADED</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.02em;">You're on ${opts.newPlan}.</h1>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
<strong style="color:${BRAND.ink};">${opts.workspaceName}</strong> has been upgraded from ${opts.oldPlan} to <strong style="color:${BRAND.accent};">${opts.newPlan}</strong>. New features are available immediately.
</p>
<a href="https://app.xpntl.dev/settings/billing" style="display:block;text-align:center;padding:12px;background:${BRAND.accent};color:#180F09;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;">VIEW BILLING</a>
</td></tr>
`);

  const text = `Plan upgraded!

${opts.workspaceName} has been upgraded from ${opts.oldPlan} to ${opts.newPlan}.

View billing: https://app.xpntl.dev/settings/billing

— xpntl · close the gap.`;

  return { subject: `${opts.workspaceName} upgraded to ${opts.newPlan}`, html, text };
}

export function cancellationEmail(opts: {
  workspaceName: string;
  plan: string;
  endsAt: string;
}): { subject: string; html: string; text: string } {
  const html = layout(`
<p style="margin:0 0 8px;font-size:11px;color:${BRAND.muted};letter-spacing:0.1em;text-transform:uppercase;">SUBSCRIPTION CANCELLED</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.02em;">We're sorry to see you go.</h1>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
Your <strong style="color:${BRAND.ink};">${opts.plan}</strong> plan for <strong style="color:${BRAND.ink};">${opts.workspaceName}</strong> has been cancelled. You'll retain access until <strong style="color:${BRAND.accent};">${opts.endsAt}</strong>.
</p>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
Changed your mind? You can resubscribe anytime from your billing settings.
</p>
<a href="https://app.xpntl.dev/settings/billing" style="display:block;text-align:center;padding:12px;background:${BRAND.accent};color:#180F09;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;">RESUBSCRIBE</a>
</td></tr>
`);

  const text = `Subscription cancelled

Your ${opts.plan} plan for ${opts.workspaceName} has been cancelled. You'll retain access until ${opts.endsAt}.

Changed your mind? Resubscribe: https://app.xpntl.dev/settings/billing

— xpntl · close the gap.`;

  return { subject: `${opts.workspaceName} — subscription cancelled`, html, text };
}

export function licenseKeyEmail(opts: {
  workspaceName: string;
  plan: string;
  key: string;
}): { subject: string; html: string; text: string } {
  const html = layout(`
<p style="margin:0 0 8px;font-size:11px;color:${BRAND.muted};letter-spacing:0.1em;text-transform:uppercase;">LIFETIME SELF-HOST LICENSE</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${BRAND.ink};letter-spacing:-0.02em;">It's yours. Forever.</h1>
<p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
Thanks for buying the <strong style="color:${BRAND.ink};">${opts.plan}</strong> license for <strong style="color:${BRAND.ink};">${opts.workspaceName}</strong>. This is a one-time, lifetime commercial license to run xpntl on your own infrastructure — no recurring per-seat subscription.
</p>
<p style="margin:0 0 8px;font-size:11px;color:${BRAND.muted};letter-spacing:0.08em;text-transform:uppercase;">YOUR LICENSE KEY (store it safely)</p>
<p style="margin:0 0 24px;padding:14px;background:#1a120b;border-radius:8px;font-family:monospace;font-size:15px;color:${BRAND.accent};text-align:center;letter-spacing:0.05em;word-break:break-all;">${opts.key}</p>
<p style="margin:0 0 24px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
Set it as <code>XPNTL_LICENSE_KEY</code> on your self-hosted instance. Self-host setup: <a href="https://xpntl.dev/open-source/self-host/" style="color:${BRAND.accent};">xpntl.dev/open-source/self-host</a>.
</p>
<a href="https://xpntl.dev/open-source/self-host/" style="display:block;text-align:center;padding:12px;background:${BRAND.accent};color:#180F09;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;">SELF-HOST GUIDE</a>
</td></tr>
`);

  const text = `Your xpntl ${opts.plan} license

Thanks for buying the ${opts.plan} lifetime self-host license for ${opts.workspaceName}.
This is a one-time, lifetime commercial license — no recurring per-seat subscription.

YOUR LICENSE KEY (store it safely):
${opts.key}

Set it as XPNTL_LICENSE_KEY on your self-hosted instance.
Self-host guide: https://xpntl.dev/open-source/self-host/

— xpntl · close the gap.`;

  return { subject: `Your xpntl ${opts.plan} license key`, html, text };
}
