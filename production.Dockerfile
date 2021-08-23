# Global args, set before the first FROM, shared by all stages
ARG PORT=5678
ARG NODE_ENV="production"
ARG ROOT_URL="http://localhost:${PORT}"
ARG TARGET="server"

################################################################################
# Build stage 1 - `yarn build`

FROM node:14-alpine as builder
# Import our shared args
ARG NODE_ENV
ARG ROOT_URL

# Some libs are needed for node-gyp
RUN apk add --update \
  libtool autoconf automake python git make g++

# Cache node_modules for as long as possible
COPY lerna.json package.json yarn.lock /app/
COPY @app/ /app/@app/
WORKDIR /app/
RUN yarn install --frozen-lockfile --production=false --no-progress

COPY tsconfig.json babel.config.js /app/
# Folders must be copied separately, files can be copied all at once
COPY scripts/ /app/scripts/
COPY data/ /app/data/

# Finally run the build script
RUN NEXT_TRANSLATE_PATH=../client yarn build

################################################################################
# Build stage 2 - COPY the relevant things (multiple steps)

FROM node:14-alpine as clean
# Import our shared args
ARG NODE_ENV
ARG ROOT_URL

# Copy over selectively just the tings we need, try and avoid the rest
COPY --from=builder /app/lerna.json /app/package.json /app/yarn.lock /app/
COPY --from=builder /app/@app/config/ /app/@app/config/
COPY --from=builder /app/@app/db/ /app/@app/db/
COPY --from=builder /app/@app/graphql/ /app/@app/graphql/
COPY --from=builder /app/@app/lib/ /app/@app/lib/
COPY --from=builder /app/@app/components/package.json /app/@app/components/
COPY --from=builder /app/@app/components/dist/ /app/@app/components/dist/
COPY --from=builder /app/@app/client/package.json /app/@app/client/
COPY --from=builder /app/@app/client/assets/ /app/@app/client/assets/
COPY --from=builder /app/@app/client/public/ /app/@app/client/public/
COPY --from=builder /app/@app/client/next.config.js /app/@app/client/
COPY --from=builder /app/@app/client/i18n.js /app/@app/client/
COPY --from=builder /app/@app/client/src/pages /app/@app/client/src/pages
COPY --from=builder /app/@app/client/.next /app/@app/client/.next
COPY --from=builder /app/@app/server/package.json /app/@app/server/
COPY --from=builder /app/@app/server/postgraphile.tags.jsonc /app/@app/server/
COPY --from=builder /app/@app/server/dist/ /app/@app/server/dist/
COPY --from=builder /app/@app/server/uploads/ /app/@app/server/uploads/
COPY --from=builder /app/@app/worker/package.json /app/@app/worker/
COPY --from=builder /app/@app/worker/crontab /app/@app/worker/
COPY --from=builder /app/@app/worker/templates/ /app/@app/worker/templates/
COPY --from=builder /app/@app/worker/dist/ /app/@app/worker/dist/

# Shared args shouldn't be overridable at runtime (because they're baked into
# the built JS).
#
# Further, they aren't available in ENTRYPOINT (because it's at runtime), so
# push them to a .env file that we can source from ENTRYPOINT.
RUN echo -e "NODE_ENV=$NODE_ENV\nROOT_URL=$ROOT_URL" > /app/.env

RUN rm -Rf /app/node_modules /app/@app/*/node_modules

################################################################################
# Build stage FINAL - COPY everything, once, and then do a clean `yarn install`

FROM node:14-alpine

# Some libs are needed for node-gyp
RUN apk add --no-cache --virtual .build-deps \
   libtool autoconf automake python make git g++

EXPOSE $PORT
WORKDIR /app/
# Copy everything from stage 2, it's already been filtered
COPY --from=clean /app/ /app/

# Install yarn ASAP because it's the slowest
RUN yarn install --frozen-lockfile --production=true --no-progress

RUN apk del .build-deps

# Import our shared args
ARG PORT
ARG NODE_ENV
ARG ROOT_URL
ARG TARGET

LABEL description="Prodeko ilmo $TARGET"

# You might want to disable GRAPHILE_TURBO if you have issues
ENV GRAPHILE_TURBO=1 TARGET=$TARGET PORT=$PORT
ENV DATABASE_HOST="db"
ENV DATABASE_NAME="ilmo"
ENV DATABASE_OWNER="${DATABASE_NAME}"
ENV DATABASE_VISITOR="${DATABASE_NAME}_visitor"
ENV DATABASE_AUTHENTICATOR="${DATABASE_NAME}_authenticator"

# Entrypoint last so that we can run `sh` in previous build steps for debugging
ENTRYPOINT yarn "${TARGET}" start
