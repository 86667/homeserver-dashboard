#!/bin/sh
# Writes the page's config.json from the environment when the container starts
# (run by the nginx image's entrypoint, as the unprivileged nginx user).
#
#   HOMESERVER_PUBLIC_KEY  the homeserver's public key; unset = the page says it is not set up
#   AUTH_RELAY             HTTP relay for Pubky Ring; unset = the Pubky SDK's default
#   PUBKY_TESTNET_HOST     development only: use a local pubky-testnet on this host
#
# A value that is set but malformed stops the container, rather than serving a
# page that cannot work.
set -eu

OUT=/tmp/account-config.json

fail() {
  echo "account config: $1" >&2
  exit 1
}

# JSON string for a value already checked to need no escaping, or null.
json() {
  if [ -n "$1" ]; then printf '"%s"' "$1"; else printf 'null'; fi
}

KEY="${HOMESERVER_PUBLIC_KEY:-}"
KEY="${KEY#pubky}"
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -Eq '^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$'; then
  fail "HOMESERVER_PUBLIC_KEY is not a public key"
fi

RELAY="${AUTH_RELAY:-}"
if [ -n "$RELAY" ] && ! printf '%s' "$RELAY" | grep -Eq '^https?://[A-Za-z0-9._~:/?&=%+@-]+$'; then
  fail "AUTH_RELAY must be an http(s) URL"
fi

TESTNET="${PUBKY_TESTNET_HOST:-}"
if [ -n "$TESTNET" ] && ! printf '%s' "$TESTNET" | grep -Eq '^[A-Za-z0-9.:-]+$'; then
  fail "PUBKY_TESTNET_HOST must be a host name or address"
fi

[ -n "$KEY" ] || echo "account config: HOMESERVER_PUBLIC_KEY is not set; the page will say it is not set up" >&2

printf '{"homeserverPublicKey":%s,"relay":%s,"testnetHost":%s}\n' "$(json "$KEY")" "$(json "$RELAY")" "$(json "$TESTNET")" >"$OUT"
