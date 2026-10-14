/**
 * The page's runtime config (config.json) from environment variables, for the
 * dev and preview servers. The Docker image does the same at container start
 * (docker/write-config.sh); the browser checks the values (src/config.ts).
 */
export function configFromEnv(env) {
  const value = (name) => env[name]?.trim() || null;
  return {
    homeserverPublicKey: value('HOMESERVER_PUBLIC_KEY'),
    relay: value('AUTH_RELAY'),
    testnetHost: value('PUBKY_TESTNET_HOST'),
  };
}
