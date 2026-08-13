# apps/web/Dockerfile — production web image.
#
# Written ON the VPS (2026-08-13), deliberately: RELEASE_PLAN said not to write
# this blind from a laptop, because the failure mode of a wrong Dockerfile is a
# missing file at RUNTIME, and the fastest way to find that is a `docker build`
# that answers in seconds. Every line below was run before it was committed.
#
# Base is plain Node, NOT the worker's Playwright image: the web app never
# launches a browser. It does shell out to yt-dlp (see below), and that is the
# only binary it needs.
FROM node:22-bookworm-slim AS base

# python3 is yt-dlp's runtime; ca-certificates for outbound TLS; curl to fetch
# the binary in the next step.
RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends python3 ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

# Manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY remotion/package.json remotion/package.json
COPY apps/worker/package.json apps/worker/package.json

RUN pnpm install --frozen-lockfile

# THE yt-dlp TRAP, documented in SESSION_LOG since 2026-07-20: pnpm 10 does not
# run youtube-dl-exec's postinstall, so the binary it is supposed to download is
# absent and /api/search-clips + /api/import-clip 502 with a file-not-found that
# reads like a code bug. apps/web/src/lib/yt-dlp.ts invokes YOUTUBE_DL_PATH from
# that package's own constants, so the binary has to exist at exactly that path.
# Fetch it here, in the image, rather than leaving it as a manual step somebody
# has to remember on every rebuild.
RUN YTDLP_DIR="$(find /app/node_modules/.pnpm -maxdepth 4 -type d -path "*youtube-dl-exec*/bin" | head -1)" \
  && if [ -z "$YTDLP_DIR" ]; then YTDLP_DIR="$(dirname "$(find /app/node_modules/.pnpm -maxdepth 5 -type d -name "youtube-dl-exec" | head -1)/x")/youtube-dl-exec/bin"; mkdir -p "$YTDLP_DIR"; fi \
  && echo "yt-dlp dir: $YTDLP_DIR" \
  && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$YTDLP_DIR/yt-dlp" \
  && chmod +x "$YTDLP_DIR/yt-dlp" \
  && "$YTDLP_DIR/yt-dlp" --version

# The whole monorepo layout is preserved: @adgen/core ships raw .ts that Next
# transpiles, so trimming to apps/web alone breaks the build.
COPY apps/web apps/web
COPY packages/core packages/core
COPY packages/db packages/db
COPY remotion remotion
COPY apps/worker apps/worker

# NEXT_PUBLIC_* are inlined at BUILD time, so the build needs them — but ONLY
# them. Copying the whole .env in (which is what happened until 2026-08-14, via
# a .dockerignore whose patterns are not recursive) baked the Supabase service
# role and every provider key into an image layer, where anyone who can read the
# image can read them. These two are public by design: the anon key is protected
# by RLS, not by secrecy. Everything else arrives at runtime through env_file.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

WORKDIR /app/apps/web
ENV NODE_ENV=production
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" || (echo "NEXT_PUBLIC_SUPABASE_URL build arg is empty — the built app would have no Supabase URL baked in" && exit 1)
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
