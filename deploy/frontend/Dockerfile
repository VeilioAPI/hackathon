FROM node:20-alpine AS build

ARG BACKEND_URL=http://backend:3001
ENV BACKEND_URL=$BACKEND_URL

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm config set fetch-timeout 600000 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm ci

COPY frontend/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
