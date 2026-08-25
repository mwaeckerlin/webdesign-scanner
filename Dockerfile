# Role: one-shot job image, run directly, never a base for other images.
#
# It needs a real browser with fonts and a pdf toolchain, so it is built on
# the ubuntu runtime base and not on the headless scratch bases: chromium
# cannot run without a userland. Everything else stays minimal — no shell
# service, no daemon, one process that renders and exits.

ARG PACKAGES="nodejs npm poppler-utils ca-certificates fontconfig fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji"
ARG CONFIGURATION_COMMANDS="true"

FROM mwaeckerlin/ubuntu-base AS build

ENV CONTAINERNAME="webdesign-scanner"
ENV NODE_ENV="production"
# one shared browser installation instead of a copy in every home directory
ENV PLAYWRIGHT_BROWSERS_PATH="/opt/ms-playwright"
ENV OUT_DIR="/out"

# the ONBUILD hooks of the base already switched to the unprivileged user;
# installing needs root again, the last USER below switches back
USER root
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
# Generous network settings: a slow or congested link must make the build
# slow, never make it fail. Resolving IPv4 first avoids the container waiting
# out an unreachable IPv6 route to the registry, few sockets keep a fragile
# link from stalling, and three attempts ride out a single dropped
# connection — three failures in a row are a real problem and stop the build.
# Kept inside the one command, so neither the options nor the node flag leak
# into the delivered image.
RUN N="--include=dev --no-audit --no-fund --maxsockets 3 --fetch-timeout=300000 --fetch-retries=5 --fetch-retry-maxtimeout=120000"; export NODE_OPTIONS=--dns-result-order=ipv4first; npm ci $N || npm ci $N || npm ci $N

# the browser build and its system libraries must match the pinned playwright.
# It goes before the sources on purpose: a code change must not cost another
# browser download.
RUN npx playwright install --with-deps chromium

COPY src ./src
RUN npm run compile

# the compiler and the test runner have no business in the delivered image
RUN npm prune --omit=dev

# ubuntu's npm drags in a whole build toolchain — linters, bundlers, python.
# It was needed to install and compile, it is not needed to run: removing it
# takes every package that only it depended on with it.
RUN $PKG_REMOVE npm
RUN bash -c "$PKG_CLEANUP"
RUN rm -rf /root/.npm /tmp/*

RUN mkdir -p ${OUT_DIR}
RUN ${ALLOW_USER} /app ${OUT_DIR}

USER ${RUN_USER}
ENTRYPOINT ["/usr/bin/node", "/app/dist/main.js"]

# empty final stage: the delivered image carries no intermediate layers
FROM build
