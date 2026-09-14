FROM node:22-slim AS builder
WORKDIR /app
# NEXT_PUBLIC_* must be present at BUILD time (Next.js inlines them into
# the client JS bundle). ENV here guarantees they're available regardless
# of .env file presence in the build context.
ENV NEXT_PUBLIC_SUPABASE_URL=https://gzbjqtvipsuubmynxhdl.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Di7hmYy_32gmGDY1aCsjAg_4-_bR0bQ
ENV NEXT_PUBLIC_APPS_SUPABASE_URL=https://gzbjqtvipsuubmynxhdl.supabase.co
ENV NEXT_PUBLIC_APPS_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Di7hmYy_32gmGDY1aCsjAg_4-_bR0bQ
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
EXPOSE 3000
CMD ["npm", "start"]
