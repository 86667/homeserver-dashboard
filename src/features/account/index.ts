/**
 * The public account page: sign-up and sign-in with Pubky Ring, talking to
 * the homeserver's public API from the visitor's browser.
 *
 * This feature is the public side of the dashboard. It shares only the UI
 * primitives and a few generic helpers with the admin side, and never uses
 * the admin API or any admin module; eslint.config.mjs enforces that.
 * Server-only code (reading the config) is in './server'.
 */
export { AccountFlow } from './components/AccountFlow';
