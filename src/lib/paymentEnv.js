/* global __RYUGE_DEPLOY_ENV__ */
// Single source of truth for which payment server and Stripe key the storefront uses.
// Production builds keep the existing live server; every other build (PR previews, local)
// is pinned to the isolated sandbox and accepts only a Stripe test publishable key.
const DEPLOY_ENV = typeof __RYUGE_DEPLOY_ENV__ === "string" ? __RYUGE_DEPLOY_ENV__ : "sandbox";

export const IS_PRODUCTION_BUILD = DEPLOY_ENV === "production";

export const PAYMENT_API_BASE = IS_PRODUCTION_BUILD
  ? "https://ryuge-site.onrender.com"
  : "https://ryuge-inventory-sandbox.onrender.com";

export function stripePublishableKey(env = import.meta.env) {
  if (IS_PRODUCTION_BUILD) return env.VITE_STRIPE_PUBLIC_KEY || null;
  const key = env.VITE_STRIPE_SANDBOX_PUBLIC_KEY;
  return typeof key === "string" && key.startsWith("pk_test_") ? key : null;
}

// Inventory responses: the server is authoritative (it refuses out-of-stock checkouts).
// "disabled" (feature flag off or endpoint not deployed) means no inventory gating, exactly
// like the storefront before inventory existed; "unknown" fails closed for managed items.
// In production builds a failed lookup (network, cold start, 5xx) does not block sales:
// the server still refuses out-of-stock checkouts, so the storefront fails open there.
export function classifyAvailability(status, body, managedIds, { failOpen = IS_PRODUCTION_BUILD } = {}) {
  if (status === 404 || (status === 200 && body && body.enabled === false)) return { kind: "disabled" };
  if (failOpen && (status === 0 || status >= 500)) return { kind: "disabled" };
  if (status !== 200 || !body || body.enabled !== true || !body.quantities) return { kind: "unknown" };
  const complete = managedIds.every((id) => Number.isSafeInteger(body.quantities[id]) && body.quantities[id] >= 0);
  return complete ? { kind: "enabled", quantities: body.quantities } : { kind: "unknown" };
}
