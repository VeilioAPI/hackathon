# Build Daml contracts and run Canton multinode sandbox.
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

FROM eclipse-temurin:17-jre

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=daml-builder /root/.daml/sdk/3.4.11/canton/canton.jar /opt/canton/canton.jar
COPY --from=daml-builder /build/.daml/dist/veilio-governance-0.2.0.dar /app/dars/
COPY deploy/canton/veilio-multinode.conf /app/canton/veilio-multinode.conf
COPY deploy/canton/bootstrap.canton /app/canton/bootstrap.canton
COPY deploy/canton/entrypoint.sh /entrypoint.sh

RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

VOLUME ["/shared"]
EXPOSE 5011 5013 5021 5023

HEALTHCHECK --interval=5s --timeout=5s --retries=60 --start-period=90s \
  CMD test -f /shared/.canton-ready

ENTRYPOINT ["/entrypoint.sh"]
