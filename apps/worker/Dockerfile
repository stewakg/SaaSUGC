# apps/worker/Dockerfile — production worker image (F6).
#
# LIVE-VERIFIED 2026-07-18: built and deployed to the real Hetzner VPS
# (/opt/adgen-saas, compose project `adgen`); a real `quick_test` job was
# submitted from apps/web and processed end-to-end by this exact image (see
# INFRASTRUCTURE.md F2/F6 for the result and the two bugs this deploy caught
# — see the Node install comment below for the third).
#
# Base: Microsoft's Playwright image, not a plain Node image. @remotion/renderer
# launches a headless Chrome-family browser (this repo's real local Remotion
# render in F4 used its auto-downloaded Chrome Headless Shell) — that binary
# needs a long, version-drifting list of system libraries (libnss3, libgbm,
# libasound2, fonts, …) that are easy to get subtly wrong by hand-picking an
# apt-get list. Playwright's maintained image already bundles a complete,
# tested set of exactly those Chromium-family runtime dependencies, so
# building on it sidesteps that risk. VERIFY the tag below is still current
# before building — check https://mcr.microsoft.com/en-us/product/playwright/tags
# and match it to whatever Playwright version is current when you build this;
# "v1.48.0-jammy" was current knowledge at write time, not a live check.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS base

# LIVE-VERIFIED FIX (2026-07-18, first real deploy): the Playwright image
# above ships Node 20.18.0, but @supabase/supabase-js needs Node 22+'s native
# WebSocket global — the worker crash-looped with "Node.js detected but
# native WebSocket not found" until Node was upgraded explicitly here.
# Playwright gives us the Chrome dependencies (see the FROM comment's
# original reasoning); NodeSource gives us the Node version independently of
# whatever the base image happens to bundle.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Playwright's image ships Node, but not necessarily this monorepo's pinned
# pnpm version — pin explicitly rather than relying on the image default.
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

# Manifests first for layer caching — `pnpm install` only reruns when one of
# these actually changes, not on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY remotion/package.json remotion/package.json

# No --prod: apps/worker's "start" script runs `tsx src/index.ts` directly
# (no separate compile step) — tsx/typescript (devDependencies) are needed at
# runtime, not just for typechecking, so they must not be pruned.
RUN pnpm install --frozen-lockfile

# LocalRemotionRenderer resolves the /remotion project relative to its OWN
# file location (packages/core/src/providers/renderer.local.ts, 4 directories
# up) — the monorepo's relative layout must be preserved here, not just
# apps/worker copied in isolation.
COPY apps/worker apps/worker
COPY packages/core packages/core
COPY packages/db packages/db
COPY remotion remotion

WORKDIR /app/apps/worker

ENV NODE_ENV=production

CMD ["pnpm", "start"]
