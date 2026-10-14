# The public account page, as static files served by nginx.
#
# Build from the repository root (the page shares the admin app's UI
# primitives and theme):
#   docker build -f account/Dockerfile -t homeserver-account .
#
# Run:
#   docker run -p 8080:8080 -e HOMESERVER_PUBLIC_KEY=<key> homeserver-account

# The build output is plain files, the same on every architecture, so the
# build stage runs once on the build machine's own platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder
WORKDIR /repo/account
COPY account/package.json account/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY account/ ./
# What the page shares with the admin app (see SHARED in vite.config.ts).
COPY src/components/ui /repo/src/components/ui
COPY src/hooks/useCopyFeedback.ts /repo/src/hooks/
COPY src/lib/utils.ts src/lib/pubky-ring.ts /repo/src/lib/
COPY src/app/theme.css /repo/src/app/
COPY public /repo/public
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY account/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY account/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY account/docker/write-config.sh /docker-entrypoint.d/40-write-account-config.sh
COPY --from=builder /repo/account/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1
