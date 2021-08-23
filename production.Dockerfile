# Global args, set before the first FROM, shared by all stages
ARG PORT=5678
ARG NODE_ENV="production"
ARG ROOT_URL="http://localhost:${PORT}"

################################################################################
# Build stage base - workdir, expose, dependencies and files needed by all stages
FROM node:14-alpine AS base

WORKDIR /app/

# Some libs are needed for node-gyp, sodium-native and bufferutils
RUN apk add --no-cache --virtual .build-deps \
   alpine-sdk bash libtool autoconf automake make python python3 curl git g++

EXPOSE $PORT

################################################################################
# Build stage build - build the project
FROM base as build

# Import our shared args
ARG NODE_ENV
ARG ROOT_URL

COPY lerna.json package.json .yarnrc.yml yarn.lock /app/
COPY .yarn /app/.yarn
COPY @app/ /app/@app/

# TODO: should add --immutable here but for some reason that doesn't work
# with docker + yarn v3
RUN yarn install

COPY nx.json workspace.json /app/
COPY tsconfig.json babel.config.js /app/
COPY scripts/ /app/scripts/
COPY data/ /app/data/

# Finally run the build script
RUN NEXT_TRANSLATE_PATH=../client yarn build

################################################################################
# Build stage clean - COPY the relevant things (multiple steps)
FROM build as clean

# Copy over selectively just the tings we need, try and avoid the rest
COPY --from=build /app/lerna.json /app/package.json /app/.yarnrc.yml /app/yarn.lock /app/
COPY --from=build /app/.yarn /app/.yarn
COPY --from=build /app/nx.json /app/workspace.json /app/
COPY --from=build /app/@app/config/ /app/@app/config/
COPY --from=build /app/@app/db/ /app/@app/db/
COPY --from=build /app/@app/graphql/ /app/@app/graphql/
COPY --from=build /app/@app/lib/ /app/@app/lib/
COPY --from=build /app/@app/components/package.json /app/@app/components/
COPY --from=build /app/@app/components/dist/ /app/@app/components/dist/
COPY --from=build /app/@app/client/package.json /app/@app/client/
COPY --from=build /app/@app/client/assets/ /app/@app/client/assets/
COPY --from=build /app/@app/client/public/ /app/@app/client/public/
COPY --from=build /app/@app/client/next.config.js /app/@app/client/
COPY --from=build /app/@app/client/i18n.js /app/@app/client/
COPY --from=build /app/@app/client/src/pages /app/@app/client/src/pages
COPY --from=build /app/@app/client/.next /app/@app/client/.next
COPY --from=build /app/@app/server/package.json /app/@app/server/
COPY --from=build /app/@app/server/postgraphile.tags.jsonc /app/@app/server/
COPY --from=build /app/@app/server/dist/ /app/@app/server/dist/
COPY --from=build /app/@app/server/uploads/ /app/@app/server/uploads/
COPY --from=build /app/@app/worker/package.json /app/@app/worker/
COPY --from=build /app/@app/worker/crontab /app/@app/worker/
COPY --from=build /app/@app/worker/templates/ /app/@app/worker/templates/
COPY --from=build /app/@app/worker/dist/ /app/@app/worker/dist/

# Shared args shouldn't be overridable at runtime (because they're baked into
# the built JS).
#
# Further, they aren't available in ENTRYPOINT (because it's at runtime), so
# push them to a .env file that we can source from ENTRYPOINT.
RUN echo -e "NODE_ENV=$NODE_ENV\nROOT_URL=$ROOT_URL" > /app/.env

# Clear yarn and apk cache
RUN yarn cache clean
RUN apk del .build-deps

################################################################################
# Build stage env - install production dependencies, set env variables and import docker args
FROM base as env

# Import our shared args
ARG NODE_ENV
ARG ROOT_URL

# You might want to disable GRAPHILE_TURBO if you have issues
ENV GRAPHILE_TURBO=1 PORT=$PORT
ENV DATABASE_HOST="db"
ENV DATABASE_NAME="ilmo"
ENV DATABASE_OWNER="${DATABASE_NAME}"
ENV DATABASE_VISITOR="${DATABASE_NAME}_visitor"
ENV DATABASE_AUTHENTICATOR="${DATABASE_NAME}_authenticator"

################################################################################
# Build stage server - server image to run in production
FROM env as server
LABEL description="Prodeko ilmo server"
COPY --from=clean /app/ /app/
ENTRYPOINT yarn server start

################################################################################
# Build stage worker - worker image to run in production
FROM env as worker
LABEL description="Prodeko ilmo worker"
COPY --from=clean /app/ /app/
ENTRYPOINT yarn server start
