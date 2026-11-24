# syntax=docker/dockerfile:1.7
# Imagen de producción del monorepo (#35). Un solo Dockerfile con un target por servicio:
#   docker build -f infra/docker/Dockerfile --target api .
#   docker build -f infra/docker/Dockerfile --target whatsapp-bot .
#   docker build -f infra/docker/Dockerfile --target web --build-arg NEXT_PUBLIC_API_URL=https://api.<dominio> .
# El contexto de construcción es la raíz del repositorio.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# openssl lo necesita Prisma; ca-certificates para HTTPS hacia Meta, Expo y el LLM
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------- Dependencias (capa en caché mientras no cambie ningún package.json) ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/whatsapp-bot/package.json apps/whatsapp-bot/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --no-audit --no-fund

# ---------- Paquetes compartidos ----------
FROM deps AS build-base
COPY . .
RUN npm run build --workspace=@salud-digna/shared \
  && npm run build --workspace=@salud-digna/ui

# ---------- API (NestJS + Prisma) ----------
FROM build-base AS build-api
RUN npm run build --workspace=@salud-digna/api

FROM base AS api
ENV NODE_ENV=production PORT=3000
# Se conserva el CLI de Prisma y tsx para `migrate deploy` y `seed` dentro del contenedor
COPY --from=build-api /app /app
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ---------- Bot de WhatsApp ----------
FROM build-base AS build-bot
RUN npm run build --workspace=@salud-digna/whatsapp-bot

FROM base AS whatsapp-bot
ENV NODE_ENV=production PORT=3001
COPY --from=build-bot /app /app
WORKDIR /app/apps/whatsapp-bot
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ---------- Web (Next.js standalone) ----------
FROM build-base AS build-web
# Las variables NEXT_PUBLIC_* se incrustan en el bundle durante el build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
RUN npm run build --workspace=@salud-digna/web \
  && mkdir -p apps/web/public

FROM base AS web
ENV NODE_ENV=production PORT=3002 HOSTNAME=0.0.0.0
COPY --from=build-web /app/apps/web/.next/standalone ./
COPY --from=build-web /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web /app/apps/web/public ./apps/web/public
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
