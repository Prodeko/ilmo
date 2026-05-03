ARG PORT=5678
ARG NODE_ENV="production"
ARG ROOT_URL="http://localhost:${PORT}"

FROM node:20-bookworm-slim

ENV TZ=Europe/Helsinki

RUN apt-get update && \
    apt-get install -y --no-install-recommends tini bash tzdata ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    cp /usr/share/zoneinfo/${TZ} /etc/localtime && \
    echo ${TZ} > /etc/timezone

RUN npm install -g pnpm@10

WORKDIR /app

ARG NODE_ENV
ARG ROOT_URL
ARG PORT
ENV NODE_ENV=${NODE_ENV}
ENV ROOT_URL=${ROOT_URL}
ENV GRAPHILE_TURBO=1
ENV PORT=${PORT}
ENV DATABASE_HOST="db"
ENV DATABASE_NAME="ilmo"
ENV DATABASE_OWNER="${DATABASE_NAME}"
ENV DATABASE_VISITOR="${DATABASE_NAME}_visitor"
ENV DATABASE_AUTHENTICATOR="${DATABASE_NAME}_authenticator"

EXPOSE ${PORT}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc /app/
COPY @app/ /app/@app/

RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

COPY tsconfig.json /app/
COPY scripts/ /app/scripts/
COPY data/ /app/data/

RUN --mount=type=secret,id=GITHUB_SHA \
    export GITHUB_SHA=$(cat /run/secrets/GITHUB_SHA 2>/dev/null || echo "unknown") && \
    NEXT_TRANSLATE_PATH=../client pnpm build

RUN CI=true pnpm prune --prod

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["pnpm", "--filter", "@app/server", "run", "start"]
