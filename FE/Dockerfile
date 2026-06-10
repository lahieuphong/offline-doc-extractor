# cspell:ignore chainguard nonroot distroless
FROM cgr.dev/chainguard/node:latest-dev AS deps
USER root
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile && yarn cache clean

FROM cgr.dev/chainguard/node:latest-dev AS builder
USER root
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=65532:65532 /app/.next ./.next
COPY --from=builder --chown=65532:65532 /app/public ./public
COPY --from=builder --chown=65532:65532 /app/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=builder --chown=65532:65532 /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=65532:65532 /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder --chown=65532:65532 /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

CMD ["node_modules/next/dist/bin/next", "start", "-p", "3000"]
