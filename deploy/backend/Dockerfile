FROM eclipse-temurin:17-jdk AS daml-builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*

ARG DAML_VERSION=3.4.11
RUN curl -fSL "https://github.com/digital-asset/daml/releases/download/v${DAML_VERSION}/daml-sdk-${DAML_VERSION}-linux-x86_64.tar.gz" \
    -o /tmp/daml-sdk.tar.gz \
  && mkdir -p /tmp/daml-sdk \
  && tar xzf /tmp/daml-sdk.tar.gz -C /tmp/daml-sdk --strip-components=1 \
  && bash /tmp/daml-sdk/install.sh --install-with-custom-version "${DAML_VERSION}" \
  && rm -rf /tmp/daml-sdk /tmp/daml-sdk.tar.gz
ENV PATH="/root/.daml/bin:${PATH}"

WORKDIR /build
COPY daml.yaml multi-package.yaml ./
COPY daml/ daml/
COPY daml-script/daml.yaml daml-script/
COPY daml-script/daml/ daml-script/daml/

RUN daml build --all

FROM node:20-alpine AS build

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm config set fetch-timeout 600000 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm ci

COPY backend/tsconfig.json ./
COPY backend/src/ src/
RUN npm run build
RUN cp src/db/schema.sql dist/db/schema.sql

FROM node:20-alpine

RUN apk add --no-cache bash postgresql-client wget

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=daml-builder /build/.daml/dist/veilio-governance-0.2.0.dar /app/dars/veilio-governance-0.2.0.dar
COPY deploy/backend/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENV PORT=3001
ENV CANTON_DAR_PATH=/app/dars/veilio-governance-0.2.0.dar
EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
