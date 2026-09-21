FROM node:22-slim AS builder
WORKDIR /app
# NEXT_PUBLIC_* must be present at BUILD time (Next.js inlines them into
# the client JS bundle). Railway injects service variables as build args
# when declared with ARG — single source of truth is the Railway env matrix,
# NOT this file. (TURNSTILE_SITE_KEY was once hardcoded empty here, which
# silently tree-shook the whole turnstile client out of the bundle.)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APPS_SUPABASE_URL
ARG NEXT_PUBLIC_APPS_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APPS_SUPABASE_URL=$NEXT_PUBLIC_APPS_SUPABASE_URL
ENV NEXT_PUBLIC_APPS_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_APPS_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
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
