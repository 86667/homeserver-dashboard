// The account page against a real homeserver: sign-up with an invite code and
// sign-in, in Chrome, with the Pubky SDK playing Pubky Ring.
//
// Needs a local pubky-testnet with invite codes required, so it skips when
// none answers. From pubky-homeserver:
//
//   cargo run -p pubky-testnet -- --homeserver-config <config with signup_mode = "token_required"> persist <dir>
//
// By default it builds the page and serves it with `vite preview`. Set
// ACCOUNT_E2E_URL to test a running page instead (e.g. the Docker image, run
// with HOMESERVER_PUBLIC_KEY, AUTH_RELAY and PUBKY_TESTNET_HOST for the testnet).
//
//   ACCOUNT_E2E_TESTNET_HOST   testnet host (default localhost)
//   ACCOUNT_E2E_ADMIN_PASSWORD testnet admin password (default admin); used only
//                              by this spec, to mint invite codes
//   E2E_CHROME                 Chrome to drive (default /usr/bin/google-chrome)
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { Keypair, Pubky, PublicKey } from '@synonymdev/pubky';
import { chromium } from 'playwright-core';

const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
const HOST = process.env.ACCOUNT_E2E_TESTNET_HOST || 'localhost';
const ADMIN = `http://${HOST}:6288`;
const ADMIN_PASSWORD = process.env.ACCOUNT_E2E_ADMIN_PASSWORD || 'admin';
const CHROME = process.env.E2E_CHROME || '/usr/bin/google-chrome';

let checks = 0;
function check(ok, label, detail = '') {
  checks += 1;
  if (!ok) throw new Error(`FAILED: ${label}${detail ? ` (${detail})` : ''}`);
  console.log(`  ok ${label}${detail ? ` (${detail})` : ''}`);
}
const step = (label) => console.log(`- ${label}`);

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

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/** Builds the page and serves it with `vite preview`, configured for the testnet. */
async function startPreview(info) {
  execFileSync('npm', ['run', 'build', '--silent'], { cwd: APP_DIR, stdio: 'inherit' });
  const port = await freePort();
  const child = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', 'localhost'], {
    cwd: APP_DIR,
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      HOMESERVER_PUBLIC_KEY: info.public_key,
      AUTH_RELAY: `http://${HOST}:15412/inbox`,
      PUBKY_TESTNET_HOST: HOST,
    },
  });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${url}/config.json`)).ok) return { url, stop: () => process.kill(-child.pid) };
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  process.kill(-child.pid);
  throw new Error('vite preview did not come up');
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

console.log('SPEC account');
const server = process.env.ACCOUNT_E2E_URL
  ? { url: process.env.ACCOUNT_E2E_URL, stop: () => {} }
  : await startPreview(info);
const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const alice = Keypair.random();
try {
  const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const cspViolations = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text());
  });

  step('invite link: the code is filled in and checked');
  const code = await mintCode();
  await page.goto(`${server.url}/?token=${code}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
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

  check(cspViolations.length === 0, 'no Content Security Policy violations', cspViolations[0]);
  console.log(`SPEC PASS account (${checks} checks)`);
} catch (error) {
  console.error('SPEC FAIL account');
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.stop();
}
