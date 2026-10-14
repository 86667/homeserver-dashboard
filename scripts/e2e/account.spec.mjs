// The /account page against a real homeserver: sign-up with an invite code
// and sign-in, in Chrome, with the Pubky SDK playing Pubky Ring. The
// dashboard runs as a public instance (DASHBOARD_MODE=account), and the spec
// checks the admin side is unreachable on it.
//
// Unlike the other specs this needs a real local pubky-testnet (the page's
// browser side talks to the homeserver directly), so it skips when none is
// running. Start one with invite codes required, e.g. from pubky-homeserver:
//
//   cargo run -p pubky-testnet -- --homeserver-config <config with signup_mode = "token_required"> persist <dir>
//
// ACCOUNT_E2E_TESTNET_HOST (default localhost) and ACCOUNT_E2E_ADMIN_PASSWORD
// (default admin) point it elsewhere. The admin API is used only by this spec,
// to mint invite codes; the page itself never touches it.
import { Keypair, Pubky, PublicKey } from '@synonymdev/pubky';
import { check, runSpec, step } from './lib/harness.mjs';

const HOST = process.env.ACCOUNT_E2E_TESTNET_HOST || 'localhost';
const ADMIN = `http://${HOST}:6288`;
const ADMIN_PASSWORD = process.env.ACCOUNT_E2E_ADMIN_PASSWORD || 'admin';

const admin = (path, init = {}) =>
  fetch(`${ADMIN}${path}`, { ...init, headers: { 'X-Admin-Password': ADMIN_PASSWORD, ...init.headers } });

async function testnetInfo() {
  try {
    const response = await admin('/info', { signal: AbortSignal.timeout(2000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const info = await testnetInfo();
if (!info) {
  console.log(`SPEC SKIP account (no pubky-testnet admin API at ${ADMIN})`);
  process.exit(0);
}

const pubky = Pubky.testnet(HOST);
const mintCode = async () => (await (await admin('/generate_signup_token')).text()).trim();

/** What Ring does with a scanned link: sign up when asked (unless told not to), then approve a sign-in for it. */
async function ring(url, keypair, { signUp = true } = {}) {
  const parsed = new URL(url.replace('pubkyauth://', 'https://ring/'));
  const query = parsed.searchParams;
  if (parsed.pathname === '/signup' && signUp) {
    await pubky.signer(keypair).signup(PublicKey.from(query.get('hs')), query.get('st'));
  }
  const signIn = `pubkyauth://signin?caps=${encodeURIComponent(query.get('caps'))}&relay=${encodeURIComponent(query.get('relay'))}&secret=${query.get('secret')}`;
  await pubky.signer(keypair).approveAuthRequest(signIn);
}

async function ringLink(page) {
  await page.waitForSelector('[data-testid="account-qr"]', { timeout: 30_000 });
  return page.getAttribute('a:has-text("Open in Pubky Ring on this device")', 'href');
}

const alice = Keypair.random();

await runSpec(
  'account',
  async ({ env, browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();

    step('invite link: the code is filled in and checked');
    const code = await mintCode();
    await page.goto(`${env.baseUrl}/account?token=${code}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('text=Invite code accepted.', { timeout: 60_000 });
    check((await page.inputValue('#invite-code')) === code, 'code from the link is in the field');

    step('sign-up through Ring creates the account');
    await page.click('[data-testid="account-signup"]');
    const signUpLink = await ringLink(page);
    check(signUpLink.startsWith('pubkyauth://signup?'), 'Ring is asked to sign up', signUpLink.slice(0, 40));
    check(
      signUpLink.includes(`hs=${info.public_key}`) && signUpLink.includes(`st=${code}`),
      'link names homeserver and code',
    );
    await ring(signUpLink, alice);
    await page.waitForSelector('text=Welcome to your homeserver', { timeout: 30_000 });
    const shown = await page.textContent('[data-testid="account-pubky"]');
    check(shown === `pubky${alice.publicKey.z32()}`, 'the new pubky is shown', shown);

    step('back at the start, the spent code shows as used');
    await page.click('button:has-text("Sign out")');
    await page.waitForSelector('text=This invite code has already been used.', { timeout: 30_000 });
    check(true, 'spent code reported as used');

    step('Ring falling back to a key it already has: the code stays unused');
    await page.fill('#invite-code', await mintCode());
    await page.waitForSelector('text=Invite code accepted.', { timeout: 30_000 });
    await page.click('[data-testid="account-signup"]');
    await ring(await ringLink(page), alice, { signUp: false });
    await page.waitForSelector('text=You already have an account here', { timeout: 30_000 });
    check(true, 'existing account recognised');
    await page.click('button:has-text("Sign out")');

    step('sign-in: welcome back, and an unknown key has no account');
    await page.click('[data-testid="account-signin"]');
    await ring(await ringLink(page), alice);
    await page.waitForSelector('text=Welcome back', { timeout: 30_000 });
    check(true, 'sign-in recognised');
    await page.click('button:has-text("Sign out")');
    await page.click('[data-testid="account-signin"]');
    await ring(await ringLink(page), Keypair.random());
    await page.waitForSelector('[data-testid="account-missing"]', { timeout: 30_000 });
    check(true, 'unknown key reported as no account');

    step('an account instance serves nothing of the admin side');
    for (const path of ['/dashboard', '/api/admin/info', '/api/server-config', '/cloudflare-guide']) {
      const response = await fetch(`${env.baseUrl}${path}`, { redirect: 'manual' });
      check(response.status === 404, `${path} is 404`, String(response.status));
    }
    const home = await fetch(`${env.baseUrl}/`, { redirect: 'manual' });
    check(home.headers.get('location')?.endsWith('/account') ?? false, '/ sends visitors to /account');
  },
  {
    platform: 'standalone',
    env: {
      DASHBOARD_MODE: 'account',
      HOMESERVER_PUBLIC_KEY: info.public_key,
      AUTH_RELAY: `http://${HOST}:15412/inbox`,
      PUBKY_TESTNET_HOST: HOST,
    },
  },
);
