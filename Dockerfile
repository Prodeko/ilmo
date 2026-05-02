ARG PORT=5678
ARG NODE_ENV="production"
ARG ROOT_URL="http://localhost:${PORT}"

FROM node:20-alpine

ENV TZ=Europe/Helsinki

RUN apk add --no-cache tini bash tzdata && \
    cp /usr/share/zoneinfo/${TZ} /etc/localtime && \
    echo ${TZ} > /etc/timezone

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

ARG NODE_ENV
ARG ROOT_URL
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

RUN pnpm prune --prod

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["pnpm", "--filter", "@app/server", "run", "start"]
