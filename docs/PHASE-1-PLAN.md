# Phase 1 Implementation Plan: yarn to pnpm and toolchain simplification

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: Replace Yarn 3 with pnpm 10, bump Node 14 to 20, remove Nx, Cypress, the dev-container pattern, and the multi-stage Dockerfile. After this plan lands, a fresh clone runs with `pnpm i && pnpm dev`.

Architecture: Nine sequential commits, each leaving the repo in a buildable state on the migration branch. The yarn-to-pnpm cutover (Task 4) is atomic. Cypress, Nx, and the dev container are removed first while still on yarn so each commit is reviewable in isolation. Docker and CI changes follow once pnpm works locally.

Tech Stack: pnpm 10, Node 20 LTS, Docker, GitHub Actions, postgres (wal2json), redis, graphile-worker, postgraphile, Next.js, fastify.

Reference for the why: `ADR-001-toolchain-rework.md` at repo root.

---

## File map

Created:

- `pnpm-workspace.yaml`
- `.npmrc`
- `Dockerfile` (replaces `docker/dockerfiles/Dockerfile.prod`)
- `docker/postgres/Dockerfile` (relocated from `docker/dockerfiles/Dockerfile.dev.db`)
- `docker/postgres/db_setup.dev.sh` (relocated from `docker/dockerfiles/scripts/db_setup.dev.sh`)

Modified:

- `package.json` (root)
- `@app/server/package.json`, `@app/worker/package.json`, `@app/db/package.json`, `@app/graphql/package.json`, `@app/client/package.json`, `@app/components/package.json`, `@app/lib/package.json`, `@app/config/package.json`
- `@app/db/.gmrc`
- `scripts/_setup_utils.mjs`, `scripts/setup_env.mjs`, `scripts/setup_db.mjs`, `scripts/test.mjs`, `scripts/start.mjs`, `scripts/clean.mjs`
- `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.test.prod.yml`
- `.gitignore`, `.dockerignore`
- `.github/workflows/nodejs.yml`, `.github/workflows/production-docker.yml`, `.github/workflows/nextjs_bundle_analysis.yml`
- `.github/actions/node-and-cache/action.yml`
- `README.md`

Deleted:

- `.yarn/` (entire directory)
- `yarn.lock`, `.yarnrc.yml`
- `nx.json`, `workspace.json`
- `apollo.config.js` (only used by the VSCode Apollo extension that nobody is running)
- `@app/e2e/` (entire workspace)
- `.github/workflows/cypress.yml`
- `docker/package.json`, `docker/README.md`
- `docker/dockerfiles/Dockerfile.dev`
- `docker/dockerfiles/Dockerfile.prod` (replaced by root `Dockerfile`)
- `docker/scripts/setup.sh`, `docker/scripts/clean-volumes.mjs`, `docker/scripts/docker-setup.mjs`
- `docker/dockerfiles/scripts/` (after `db_setup.dev.sh` is moved)
- `.devcontainer/`

---

## Task 1: Delete Cypress and the @app/e2e workspace

Files:

- Delete: `@app/e2e/` (entire directory)
- Delete: `.github/workflows/cypress.yml`
- Modify: `package.json` (root) - remove the `e2e` shortcut script

- [ ] Step 1: Delete the workspace and CI workflow

```bash
rm -rf @app/e2e
rm .github/workflows/cypress.yml
```

- [ ] Step 2: Remove the `e2e` shortcut from root `package.json`

In `package.json`, delete this line from the `scripts` block:

```json
"e2e": "yarn workspace @app/e2e",
```

- [ ] Step 3: Verify nothing else references `@app/e2e`

Run: `grep -rn "@app/e2e\|app/e2e" --include="*.json" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.yml" .`
Expected: no matches outside of `yarn.lock` and the deleted files.

- [ ] Step 4: Sanity-check that yarn install still works

Run: `yarn install`
Expected: clean install, no errors.

- [ ] Step 5: Commit

```bash
git add -A
git commit -m "Remove Cypress and @app/e2e workspace"
```

## Task 2: Remove Nx

Files:

- Delete: `nx.json`, `workspace.json`
- Modify: `package.json` (root) - remove nx packages from `dependencies` and `devDependencies`, remove `nxmany` and Nx-using scripts
- Modify: `scripts/clean.mjs` - remove the `nx clear-cache` call

- [ ] Step 1: Delete the Nx config files

```bash
rm nx.json workspace.json
```

- [ ] Step 2: Remove Nx packages from root `package.json`

From `dependencies`, remove:

```json
"nx": "14.5.4",
```

From `devDependencies`, remove:

```json
"@nrwl/cli": "14.5.4",
"@nrwl/eslint-plugin-nx": "14.5.4",
"@nrwl/jest": "14.5.4",
"@nrwl/linter": "14.5.4",
"@nrwl/react": "14.5.4",
"@nrwl/web": "14.5.4",
"@nrwl/workspace": "14.5.4",
"nx": "14.5.4",
```

- [ ] Step 3: Replace Nx-driven scripts in root `package.json`

Replace the `nxmany`, `build`, `test:`, `posttest`, `setup:packages`, `dev`, `concurrently`, and `depcheck` scripts. After this step the scripts block looks like:

```json
"setup": "yarn && yarn setup:env auto && yarn setup:db",
"setup:env": "node ./scripts/setup_env.mjs",
"setup:db": "node ./scripts/setup_db.mjs",
"start": "node ./scripts/start.mjs",
"test": "node scripts/test.mjs",
"test:watch": "node scripts/test.mjs --watch",
"lint": "tsc -b && yarn prettier:all --check && yarn eslint .",
"lint:fix": "yarn eslint --fix . && yarn prettier:all --write && jsonsort @app/client/src/translations",
"eslint": "eslint --ext .js,.jsx,.ts,.tsx,.graphql",
"prettier:all": "prettier --ignore-path .eslintignore \"**/*.{js,jsx,ts,tsx,graphql,md}\"",
"build": "yarn workspaces foreach -pt run build",
"clean": "node ./scripts/clean.mjs",
"reset": "yarn clean && node ./scripts/delete-env-file.mjs",
"tsc": "tsc -b ./@app/lib/tsconfig.cjs.json tsconfig.json",
"dev": "yarn graphql build && yarn tsc && yarn concurrently",
"concurrently": "concurrently --kill-others-on-fail --names \"TSC,WATCH,RUN\" --prefix \"({name})\" --prefix-colors \"yellow.bold,yellow.bold,cyan.bold,greenBright.bold\" \"tsc -b --watch --preserveWatchOutput\" \"yarn workspaces foreach -p run watch\" \"yarn workspaces foreach -p run dev\"",
"depcheck": "yarn workspaces foreach -p run depcheck",
"upgrade-packages": "ncu --deep -u",
"--shortcuts to run commands in workspaces--": "",
"client": "yarn workspace @app/client",
"components": "yarn workspace @app/components",
"db": "yarn workspace @app/db",
"graphql": "yarn workspace @app/graphql",
"lib": "yarn workspace @app/lib",
"server": "yarn workspace @app/server",
"worker": "yarn workspace @app/worker",
"postinstall": "npx next telemetry disable"
```

Note: the `docker` and `docker-compose` shortcuts are also removed because the `docker/` workspace is deleted in Task 3. The `posttest` script is dropped because nothing in the project actually defined a `posttest` target.

- [ ] Step 4: Add `watch` and `dev` scripts to workspaces that need them

Several workspaces previously inherited their `watch`/`dev` targets from Nx target defaults. Verify by inspection: `@app/graphql` already has `watch`. Add a no-op `watch`/`dev` to workspaces that don't define them so `yarn workspaces foreach -p run dev` does not error. In each of `@app/server/package.json`, `@app/worker/package.json`, `@app/client/package.json`, `@app/components/package.json`, `@app/lib/package.json`, `@app/config/package.json`, `@app/db/package.json`, ensure a `watch` script exists; if absent, add:

```json
"watch": "exit 0",
```

And ensure each that should not run `dev` defines `"dev": "exit 0"`. The workspaces that should actually do something on `dev`:

- `@app/server`: keeps existing `dev` (the nodemon line).
- `@app/client`: add `"dev": "NODE_OPTIONS=\"-r @app/config/env.js\" next dev"`.
- `@app/worker`: keeps existing `dev`.
- `@app/graphql`: `"dev": "yarn watch"`.
- All others: `"dev": "exit 0"`.

- [ ] Step 5: Remove `nx clear-cache` from `scripts/clean.mjs`

Replace the `execSync("nx clear-cache", ...)` line. The full file becomes:

```javascript
#!/usr/bin/env node
import rimraf from "rimraf"
import { dirname } from "./_setup_utils.mjs"

const __dirname = dirname(import.meta)

try {
  rimraf.sync(`${__dirname}/../@app/*/dist`)
  rimraf.sync(`${__dirname}/../@app/*/tsconfig.tsbuildinfo`)
  rimraf.sync(`${__dirname}/../@app/client/.next`)
  rimraf.sync(`${__dirname}/../@app/server/uploads/*`)
  rimraf.sync(`${__dirname}/../@app/graphql/index.*`)
  rimraf.sync(`${__dirname}/../@app/graphql/introspection.json`)
  rimraf.sync(`${__dirname}/../@app/graphql/introspection.min.json`)
} catch (e) {
  console.error("Failed to clean up, perhaps rimraf isn't installed?")
  console.error(e)
}
```

- [ ] Step 6: Verify build and lint still work without Nx

```bash
yarn install
yarn build
yarn lint
```

Expected: build and lint complete without errors. `dev` is not validated yet because `yarn workspaces foreach` orchestration may need tuning, which is left for the smoke test in Task 9.

- [ ] Step 7: Confirm no Nx remnants

Run: `grep -rn "nx\|nrwl" --include="*.json" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.yml" .`
Expected: no remaining matches outside `yarn.lock`.

- [ ] Step 8: Commit

```bash
git add -A
git commit -m "Remove Nx and switch to yarn workspaces foreach"
```

## Task 3: Remove dev container, slim docker-compose, relocate wal2json files

Files:

- Delete: `.devcontainer/`, `docker/package.json`, `docker/README.md`, `docker/dockerfiles/Dockerfile.dev`, `docker/scripts/`
- Move: `docker/dockerfiles/Dockerfile.dev.db` → `docker/postgres/Dockerfile`
- Move: `docker/dockerfiles/scripts/db_setup.dev.sh` → `docker/postgres/db_setup.dev.sh`
- Modify: `docker/postgres/Dockerfile` (update the `COPY` path now that the script lives next to it)
- Modify: `docker-compose.yml` (strip `server` and `dev` services, repoint `db` build context)
- Modify: `package.json` (root) - remove `docker` and `docker-compose` shortcut scripts (already done in Task 2)

- [ ] Step 1: Move the wal2json Postgres files

```bash
mkdir -p docker/postgres
git mv docker/dockerfiles/Dockerfile.dev.db docker/postgres/Dockerfile
git mv docker/dockerfiles/scripts/db_setup.dev.sh docker/postgres/db_setup.dev.sh
```

- [ ] Step 2: Update the COPY line in `docker/postgres/Dockerfile`

Change the last line from:

```dockerfile
COPY ./docker/dockerfiles/scripts/db_setup.dev.sh /docker-entrypoint-initdb.d/db_setup.dev.sh
```

to:

```dockerfile
COPY db_setup.dev.sh /docker-entrypoint-initdb.d/db_setup.dev.sh
```

- [ ] Step 3: Replace `docker-compose.yml` with a minimal version

```yaml
version: "3.8"
services:
  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - cache-volume:/data
    restart: unless-stopped

  db:
    build:
      context: ./docker/postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    volumes:
      - db-volume:/var/lib/postgresql/data
      - ./data:/data
    ports:
      - "6543:5432"
    restart: unless-stopped
    command:
      postgres -c logging_collector=on -c log_destination=stderr -c
      log_directory=/var/lib/postgresql/data/logs -c log_rotation_age=60 -c
      log_truncate_on_rotation=on -c log_filename=server_log.hour.%H%M

volumes:
  db-volume:
  cache-volume:
```

- [ ] Step 4: Delete the dev container and the rest of `docker/`

```bash
rm -rf .devcontainer
rm -rf docker/dockerfiles
rm -rf docker/scripts
rm docker/package.json docker/README.md
```

After this only `docker/postgres/` remains under `docker/`.

- [ ] Step 5: Verify the dev DB still builds

```bash
docker compose build db
docker compose up -d db redis
docker compose ps
docker compose down
```

Expected: both services come up, `db` log shows wal2json available.

- [ ] Step 6: Commit

```bash
git add -A
git commit -m "Slim docker-compose to db+redis, remove dev container"
```

## Task 4: Migrate yarn to pnpm

This is the atomic cutover. The repo is unbuildable mid-task; commit only when every step in this task passes.

Files:

- Create: `pnpm-workspace.yaml`, `.npmrc`
- Modify: `package.json` (root) - convert `workspaces` to nothing (handled in pnpm-workspace.yaml), `resolutions` to `pnpm.overrides`, fix `workspace:@app/db` reference, replace yarn refs in scripts, set `packageManager`
- Modify: every `@app/*/package.json` - replace yarn refs in scripts
- Modify: `@app/db/.gmrc` - replace `yarn workspace` with `pnpm --filter`
- Modify: `scripts/_setup_utils.mjs` - rename `yarnCmd` to `pnpmCmd` and update value
- Modify: `scripts/setup_env.mjs`, `scripts/setup_db.mjs` - update import and usage
- Modify: `scripts/test.mjs` - replace `yarn db ...` and `yarn node ...` with pnpm equivalents
- Modify: `scripts/start.mjs` - spawn `pnpm` instead of `yarn`
- Modify: `.gitignore` - remove yarn-specific patterns, add pnpm-specific
- Modify: `.dockerignore` - remove yarn-specific patterns
- Delete: `.yarn/`, `yarn.lock`, `.yarnrc.yml`, `apollo.config.js`

- [ ] Step 1: Create `pnpm-workspace.yaml`

```yaml
packages:
  - "@app/*"
```

- [ ] Step 2: Create `.npmrc`

```
node-linker=hoisted
auto-install-peers=true
```

`hoisted` is chosen for the lowest risk of latent transitive-dep bugs surfacing on day one. After phase 1 stabilizes, this can be removed to use pnpm's default symlinked layout.

- [ ] Step 3: Update root `package.json`

Apply these changes in order:

a) Set `packageManager`:

```json
"packageManager": "pnpm@10.0.0"
```

b) Remove the `workspaces` field entirely.

c) Rename `resolutions` to `pnpm.overrides` and put it inside a top-level `pnpm` object:

```json
"pnpm": {
  "overrides": {
    "graphql": "15.x",
    "graphql-upload": "13.x",
    "faker": "5.5.3",
    "chalk": "4.1.2",
    "antd-dayjs-webpack-plugin": "github:Chastrlove/antd-dayjs-webpack-plugin",
    "got": "11.x",
    "dayjs": "1.11.4"
  }
}
```

d) Fix the non-standard workspace ref. Change:

```json
"@app/db": "workspace:@app/db",
```

to:

```json
"@app/db": "workspace:*",
```

e) Replace every `yarn` reference in `scripts` with `pnpm`. Final `scripts` block:

```json
"setup": "pnpm install && pnpm setup:env auto && pnpm setup:db",
"setup:env": "node ./scripts/setup_env.mjs",
"setup:db": "node ./scripts/setup_db.mjs",
"start": "node ./scripts/start.mjs",
"test": "node scripts/test.mjs",
"test:watch": "node scripts/test.mjs --watch",
"lint": "tsc -b && pnpm prettier:all --check && pnpm eslint .",
"lint:fix": "pnpm eslint --fix . && pnpm prettier:all --write && jsonsort @app/client/src/translations",
"eslint": "eslint --ext .js,.jsx,.ts,.tsx,.graphql",
"prettier:all": "prettier --ignore-path .eslintignore \"**/*.{js,jsx,ts,tsx,graphql,md}\"",
"build": "pnpm -r --workspace-concurrency=1 run build",
"clean": "node ./scripts/clean.mjs",
"reset": "pnpm clean && node ./scripts/delete-env-file.mjs",
"tsc": "tsc -b ./@app/lib/tsconfig.cjs.json tsconfig.json",
"dev": "pnpm --filter @app/graphql run build && pnpm tsc && pnpm concurrently",
"concurrently": "concurrently --kill-others-on-fail --names \"TSC,WATCH,RUN\" --prefix \"({name})\" --prefix-colors \"yellow.bold,yellow.bold,cyan.bold,greenBright.bold\" \"tsc -b --watch --preserveWatchOutput\" \"pnpm -r --parallel run watch\" \"pnpm -r --parallel run dev\"",
"depcheck": "pnpm -r run depcheck",
"upgrade-packages": "ncu --deep -u",
"--shortcuts to run commands in workspaces--": "",
"client": "pnpm --filter @app/client",
"components": "pnpm --filter @app/components",
"db": "pnpm --filter @app/db",
"graphql": "pnpm --filter @app/graphql",
"lib": "pnpm --filter @app/lib",
"server": "pnpm --filter @app/server",
"worker": "pnpm --filter @app/worker",
"postinstall": "npx next telemetry disable"
```

`--workspace-concurrency=1` for `build` enforces topological order. The watch and dev orchestration uses `--parallel`.

- [ ] Step 4: Update each workspace `package.json`

Replace every `yarn X` with `pnpm X` and every `yarn workspace @app/foo` with `pnpm --filter @app/foo`. Notable substitutions:

- `yarn node` → `node` (no PnP loader, plain `node` works).
- `yarn run --inspect gw --watch` (in `@app/worker`) → `node --inspect node_modules/.bin/graphile-worker --crontab ./crontab --watch`. Verify by reading the binary path in `node_modules/.bin/`.
- `yarn ts-node` → `pnpm exec ts-node`.
- `yarn jest` → `pnpm exec jest`.

`@app/server/package.json` final scripts:

```json
"build": "tsc -b",
"start": "node -r @app/config/env.js dist/index.js",
"dev": "nodemon --signal SIGINT --watch 'dist/**/*.js' -x \"node --max_old_space_size=8192 --inspect=9678 -r @app/config/env.js -r source-map-support/register\" dist/index.js",
"test": "NODE_OPTIONS=\"-r @app/config/env.js\" NODE_ENV=test pnpm exec jest",
"schema:export": "NODE_OPTIONS=\"-r @app/config/env.js\" pnpm exec ts-node --log-error scripts/schema-export.ts",
"depcheck": "depcheck --ignores=\"sharp,source-map-support,tslib,graphql,dayjs,type-fest\""
```

`@app/worker/package.json` final scripts:

```json
"gw": "cd dist && NODE_OPTIONS=\"-r @app/config/env.js\" graphile-worker --crontab ../crontab",
"build": "tsc -b",
"start": "pnpm gw",
"dev": "cd dist && NODE_OPTIONS=\"-r @app/config/env.js\" node --inspect ../node_modules/.bin/graphile-worker --crontab ../crontab --watch",
"install-db-schema": "mkdirp dist && pnpm gw --schema-only",
"depcheck": "depcheck --ignores=\"tslib\""
```

Note: `@app/worker` may not have its own `node_modules/.bin/graphile-worker` if hoisted; if `--inspect` cannot find the binary, replace the `dev` line with `pnpm exec graphile-worker --inspect ...` and fall back to running through pnpm.

`@app/db/package.json` final scripts:

```json
"gm": "NODE_OPTIONS=\"-r @app/config/env\" pnpm exec graphile-migrate",
"migrate": "pnpm gm migrate",
"watch": "pnpm gm watch",
"commit": "pnpm gm commit",
"uncommit": "pnpm gm uncommit",
"reset": "pnpm gm reset",
"dump": "pnpm gm migrate && pnpm gm reset --shadow --erase && pnpm gm migrate --shadow --forceActions",
"test": "NODE_ENV=test NODE_OPTIONS=\"-r @app/config/env.js\" pnpm exec jest",
"create-fake-data": "ts-node -r @app/config/env.js scripts/create-fake-data.ts",
"clean-fake-data": "ts-node -r @app/config/env.js scripts/clean-fake-data.ts",
"depcheck": "depcheck --ignores=\"dayjs\""
```

`@app/graphql/package.json` final scripts:

```json
"build": "pnpm codegen && tsc -b && tsc --project tsconfig.cjs.json",
"watch": "pnpm codegen --watch",
"codegen": "graphql-codegen --config codegen.yml",
"depcheck": "depcheck --ignores=\"@graphql-codegen/*,@urql/*,urql,graphql-tag,graphql-codegen-persisted-query-ids,tslib\""
```

The remaining workspaces (`@app/client`, `@app/components`, `@app/lib`, `@app/config`) have no `yarn` references in their scripts and need no changes other than the `dev`/`watch` no-ops added in Task 2 step 4.

- [ ] Step 5: Update `@app/db/.gmrc`

Replace:

```json
"command": "DATABASE_URL=\"$GM_DBURL\" yarn workspace @app/worker install-db-schema"
```

with:

```json
"command": "DATABASE_URL=\"$GM_DBURL\" pnpm --filter @app/worker run install-db-schema"
```

- [ ] Step 6: Update `scripts/_setup_utils.mjs`

Replace:

```javascript
export const yarnCmd = platform() === "win32" ? "yarn.cmd" : "yarn"
```

with:

```javascript
export const pnpmCmd = platform() === "win32" ? "pnpm.cmd" : "pnpm"
```

- [ ] Step 7: Update `scripts/setup_env.mjs`

Change the import:

```javascript
import {
  pnpmCmd,
  ...
} from "./_setup_utils.mjs"
```

Replace each `runSync(yarnCmd, [...])` call with `runSync(pnpmCmd, ["--filter", "@app/<name>", "run", "build"])`. The three lines become:

```javascript
runSync(pnpmCmd, ["--filter", "@app/graphql", "run", "build"])
runSync(pnpmCmd, ["--filter", "@app/lib", "run", "build"])
runSync(pnpmCmd, ["--filter", "@app/server", "run", "build"])
```

Replace the `${yarnCmd} setup:db` reference in the outro template literal with `${pnpmCmd} setup:db`.

- [ ] Step 8: Update `scripts/setup_db.mjs`

Same import substitution. Replace:

```javascript
runSync(yarnCmd, ["graphql", "build"])
runSync(yarnCmd, ["lib", "build"])
runSync(yarnCmd, ["server", "build"])
```

with:

```javascript
runSync(pnpmCmd, ["--filter", "@app/graphql", "run", "build"])
runSync(pnpmCmd, ["--filter", "@app/lib", "run", "build"])
runSync(pnpmCmd, ["--filter", "@app/server", "run", "build"])
```

And:

```javascript
runSync(yarnCmd, ["db", "reset", "--erase"])
runSync(yarnCmd, ["db", "reset", "--shadow", "--erase"])
```

becomes:

```javascript
runSync(pnpmCmd, ["--filter", "@app/db", "run", "reset", "--erase"])
runSync(pnpmCmd, ["--filter", "@app/db", "run", "reset", "--shadow", "--erase"])
```

The outro template `${yarnCmd} start` becomes `${pnpmCmd} start`. Drop the `export UID; yarn docker start` branch entirely; replace with `${pnpmCmd} start` since the docker-helpers workspace is gone.

- [ ] Step 9: Update `scripts/test.mjs`

Replace:

```javascript
execSync("yarn db gm reset --shadow --erase", opts)
execSync("yarn db watch --once --shadow", opts)
```

with:

```javascript
execSync("pnpm --filter @app/db run gm reset --shadow --erase", opts)
execSync("pnpm --filter @app/db run watch --once --shadow", opts)
```

Replace:

```javascript
command: `yarn node --inspect=9876 ./node_modules/jest/bin/jest.js -i ${watchMode}`,
```

with:

```javascript
command: `node --inspect=9876 ./node_modules/jest/bin/jest.js -i ${watchMode}`,
```

Replace:

```javascript
command: "yarn db watch --shadow",
```

with:

```javascript
command: "pnpm --filter @app/db run watch --shadow",
```

- [ ] Step 10: Update `scripts/start.mjs`

Replace:

```javascript
console.error("🛠️  Please run 'yarn setup' before running 'yarn start'")
```

with:

```javascript
console.error("🛠️  Please run 'pnpm setup' before running 'pnpm start'")
```

Replace:

```javascript
spawn("yarn", ["dev"], {
```

with:

```javascript
spawn("pnpm", ["dev"], {
```

- [ ] Step 11: Update `.gitignore`

Remove the yarn-specific block:

```
.yarn/*
!.yarn/cache
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions
.yarn/cache
yarn-error.log
```

The `yarn-error.log` line appears twice; remove both. No pnpm-specific entries are required because pnpm-lock.yaml should be committed.

- [ ] Step 12: Update `.dockerignore`

No yarn-specific entries are present. Add:

```
.yarn
.yarnrc.yml
yarn.lock
```

This is defensive: if any of these files survive uncommitted on a contributor's machine, they will not bleed into Docker builds.

- [ ] Step 13: Delete yarn artifacts

```bash
rm -rf .yarn
rm yarn.lock .yarnrc.yml apollo.config.js
```

- [ ] Step 14: Install pnpm and generate the lockfile

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install
```

Expected: `pnpm-lock.yaml` is created at the repo root, no peer dependency errors that block install. Warnings are acceptable.

- [ ] Step 15: Run the build

```bash
pnpm build
```

Expected: every workspace builds. If a workspace fails because a transitive dep is no longer hoisted to the workspace's `node_modules`, add the missing dep to that workspace's `package.json` `dependencies` and re-run.

- [ ] Step 16: Run lint

```bash
pnpm lint
```

Expected: passes.

- [ ] Step 17: Run dev to confirm orchestration works

```bash
docker compose up -d db redis
cp .env.ci .env  # or run pnpm setup interactively
pnpm setup:db
pnpm dev
```

Expected: server starts on :5678 and responds to `curl http://localhost:5678/`. Worker starts. Watchers are running. Stop with Ctrl-C.

- [ ] Step 18: Commit

```bash
git add -A
git commit -m "Migrate from yarn 3 to pnpm 10"
```

## Task 5: Bump Node from 14 to 20

Files:

- Modify: `package.json` (root) - update `engines.node`
- Modify: `scripts/_setup_utils.mjs` - update the runtime version check

- [ ] Step 1: Update root `package.json` `engines` field

```json
"engines": {
  "node": ">=20"
}
```

- [ ] Step 2: Update the version check in `scripts/_setup_utils.mjs`

Replace:

```javascript
if (parseInt(process.version.split(".")[0], 16) < 16) {
  throw new Error("This project requires Node.js >= 16.0.0")
}
```

with:

```javascript
if (parseInt(process.version.slice(1).split(".")[0], 10) < 20) {
  throw new Error("This project requires Node.js >= 20.0.0")
}
```

The original used base 16 parsing of `v14.x.x`, which is a bug; it parsed the leading `v` and got NaN, so the check never fired. This step fixes that too.

- [ ] Step 3: Run install with Node 20 locally

If `nvm` or similar is in use:

```bash
nvm use 20
node --version
pnpm install
pnpm build
pnpm lint
```

Expected: all green. If a dependency complains about Node 20, note it for the smoke test in Task 9 but do not chase it during this commit.

- [ ] Step 4: Commit

```bash
git add -A
git commit -m "Bump Node to 20 LTS"
```

## Task 6: Rewrite the production Dockerfile

Files:

- Create: `Dockerfile` (at repo root)
- Delete: `docker/dockerfiles/Dockerfile.prod`
- Modify: `docker-compose.prod.yml` and `docker-compose.test.prod.yml` - update entrypoints

- [ ] Step 1: Create `Dockerfile` at repo root

```dockerfile
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
```

Three deliberate changes from the previous Dockerfile:

- Single stage. The previous build/clean/env multi-stage saved disk but added complexity that nobody is reading. With Node 20's prebuilt binaries, the build stage no longer needs `alpine-sdk`, `libtool`, or `python3`.
- `tini` as PID 1 via `ENTRYPOINT ["/sbin/tini", "--"]` and exec-form `CMD`. This is the fix for the unkillable-container behavior.
- `CMD` is the server target by default. The worker image overrides via the compose file.

- [ ] Step 2: Delete the old multi-stage Dockerfile

```bash
rm docker/dockerfiles/Dockerfile.prod
```

- [ ] Step 3: Update `docker-compose.prod.yml`

Replace `entrypoint: yarn server start` and `entrypoint: yarn worker start` with `command` overrides (because the entrypoint is now `tini`):

```yaml
server:
  image: prodekoregistry.azurecr.io/ilmo/ilmo-server
  container_name: ilmo_server
  restart: unless-stopped
  command: ["pnpm", "--filter", "@app/server", "run", "start"]
  env_file:
    - .env.production
  depends_on:
    - redis

worker:
  image: prodekoregistry.azurecr.io/ilmo/ilmo-worker
  container_name: ilmo_worker
  restart: unless-stopped
  command: ["pnpm", "--filter", "@app/worker", "run", "start"]
  env_file:
    - .env.production
  depends_on:
    - redis
    - server
```

Note that today the production compose builds a single image as both `ilmo-server` and `ilmo-worker` (via the `target` argument). Phase 1 keeps this; phase 3 may collapse to a single image with two compose services pointing at it.

- [ ] Step 4: Update `docker-compose.test.prod.yml`

Same treatment for the `server` and `worker` services. Replace `entrypoint: yarn server start` with `command: ["pnpm", "--filter", "@app/server", "run", "start"]` and the worker analogue. Update the volume `./docker/dockerfiles/scripts:/docker-entrypoint-initdb.d/` to `./docker/postgres:/docker-entrypoint-initdb.d/` to reflect Task 3's relocation.

- [ ] Step 5: Build and verify locally

```bash
docker build --build-arg ROOT_URL="http://localhost:5678" --tag ilmo-server .
docker run --rm ilmo-server pnpm --filter @app/server run start --help || true
```

Expected: image builds. The container does not need to be functional without env vars; the goal here is verifying the build itself.

- [ ] Step 6: Verify the container is killable

```bash
docker run -d --name ilmo-test ilmo-server sleep 30
docker stop ilmo-test
docker rm ilmo-test
```

Expected: `docker stop` returns within ~2 seconds. This validates the `tini` PID 1 fix.

- [ ] Step 7: Commit

```bash
git add -A
git commit -m "Rewrite production Dockerfile as single-stage with tini"
```

## Task 7: Update GitHub Actions workflows

Files:

- Modify: `.github/actions/node-and-cache/action.yml`
- Modify: `.github/workflows/nodejs.yml`
- Modify: `.github/workflows/production-docker.yml`
- Modify: `.github/workflows/nextjs_bundle_analysis.yml`

- [ ] Step 1: Rewrite `.github/actions/node-and-cache/action.yml`

```yaml
name: Setup Node.js and pnpm
description: Sets up Node.js and pnpm with a cached store

inputs:
  node-version:
    description: Node version to use with actions/setup-node
    default: 20.x

runs:
  using: composite
  steps:
    - name: Install pnpm
      uses: pnpm/action-setup@v4
      with:
        version: 10
        run_install: false

    - name: Use Node.js ${{ inputs.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: pnpm

    - name: Install dependencies
      shell: bash
      run: pnpm install --frozen-lockfile
```

`actions/setup-node@v4` understands `cache: pnpm` natively, so no separate cache step is needed.

- [ ] Step 2: Update `.github/workflows/nodejs.yml`

Change the matrix:

```yaml
matrix:
  node-version: [20.x]
```

Replace the install/setup/lint block with pnpm equivalents:

```yaml
- name: Setup and build
  run: |
    cp .env.ci .env
    CONFIRM_DROP=1 pnpm setup
    pnpm build

- name: Lint, test and depcheck
  run: |
    pnpm lint
    pnpm test --ci --runInBand
    pnpm depcheck
```

Note that `pnpm install` is now part of the composite action, so the workflow no longer calls it explicitly.

- [ ] Step 3: Update `.github/workflows/production-docker.yml`

Replace the `Setup database` step:

```yaml
- name: Setup database
  run: |
    cp .env.ci .env
    CONFIRM_DROP=1 pnpm setup
  env:
    CI: true
```

Replace both `docker/build-push-action` blocks. Drop the `target: server` and `target: worker` because the new Dockerfile is single-stage; the same image runs both. Change the `file` to `./Dockerfile`. Drop the `Build worker` step entirely (the image is one). The compose file already differentiates by `command:`. Tag the single build as both:

```yaml
- name: Build production image
  uses: docker/build-push-action@v5
  with:
    file: ./Dockerfile
    load: true
    push: false
    build-args: ROOT_URL=https://ilmo.prodeko.org
    tags: |
      ilmo-server
      ilmo-worker
      ${{ secrets.REGISTRY_LOGIN_SERVER }}/ilmo/ilmo-server
      ${{ secrets.REGISTRY_LOGIN_SERVER }}/ilmo/ilmo-worker
    secrets: |
      GITHUB_SHA=${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Update the `Start server` and `Start worker` `docker run` invocations to drop `--init` (it is now baked into the image via `tini`) and to match the new `CMD`:

```yaml
- name: Start server
  run: |
    docker run --rm -d -p 5678:5678 \
      --env-file .env \
      -e CI=true \
      -e NODE_ENV=production \
      -e DATABASE_HOST=172.17.0.1 \
      -e REDIS_URL=redis://172.17.0.1:6379 \
      --name ilmo-server ilmo-server

- name: Start worker
  run: |
    docker run --rm -d \
      --env-file .env \
      -e CI=true \
      -e NODE_ENV=production \
      -e DATABASE_HOST=172.17.0.1 \
      -e REDIS_URL=redis://172.17.0.1:6379 \
      --name ilmo-worker ilmo-worker \
      pnpm --filter @app/worker run start
```

Push step retains both pushes since both tags point at the same content:

```yaml
- name: Push images to ACR
  run: |
    docker push ${{ secrets.REGISTRY_LOGIN_SERVER }}/ilmo/ilmo-server
    docker push ${{ secrets.REGISTRY_LOGIN_SERVER }}/ilmo/ilmo-worker
```

- [ ] Step 4: Update `.github/workflows/nextjs_bundle_analysis.yml`

Replace `yarn install` and `yarn build --skip-nx-cache`:

```yaml
- name: Install dependencies
  run: |
    cp .env.ci .env
  working-directory: .

- name: Build next.js app
  run: pnpm --filter @app/client run build
  working-directory: .
```

The composite action handles install. Drop `--skip-nx-cache` (Nx is gone). The build now targets the client workspace directly because Nx's run-many is gone.

- [ ] Step 5: Commit

```bash
git add -A
git commit -m "Update CI workflows for pnpm and Node 20"
```

## Task 8: Update README

Files:

- Modify: `README.md`

- [ ] Step 1: Replace yarn references in the README

Run: `grep -n "yarn" README.md`
For each occurrence, replace the command appropriately:

- `yarn` (bare) → `pnpm install`
- `yarn setup` → `pnpm setup`
- `yarn start` → `pnpm start`
- `yarn dev` → `pnpm dev`
- `yarn test` → `pnpm test`
- `yarn build` → `pnpm build`
- `yarn db <cmd>` → `pnpm --filter @app/db run <cmd>`
- `yarn server <cmd>` → `pnpm --filter @app/server run <cmd>`

- [ ] Step 2: Update the requirements section

Change "Node v14" to "Node v20 LTS" and remove "yarn" from the requirements (replace with "pnpm 10, installed via `corepack enable`").

- [ ] Step 3: Update the bootstrap section

Add a section near the top:

````markdown
## Quickstart

```bash
corepack enable
docker compose up -d db redis
cp .env.ci .env  # or run pnpm setup for interactive config
pnpm install
pnpm setup:db
pnpm dev
```

Server is on http://localhost:5678.
````

- [ ] Step 4: Remove the docker-mode vs local-mode dichotomy

The "Local mode | Docker mode" table and the warning about not mixing modes no longer apply. Delete or replace those sections with a brief note that the data services run in Docker and the application runs on the host.

- [ ] Step 5: Commit

```bash
git add README.md
git commit -m "Update README for pnpm and simplified dev setup"
```

## Task 9: Smoke test

Files: none modified.

- [ ] Step 1: Clean clone simulation

```bash
git clean -xdf
corepack enable
docker compose up -d db redis
cp .env.ci .env
pnpm install
```

Expected: `pnpm install` completes, `node_modules/` is populated, no peer-dep errors blocking install.

- [ ] Step 2: Bootstrap the database

```bash
CONFIRM_DROP=1 pnpm setup:db
```

Expected: roles created, migrations run, no errors.

- [ ] Step 3: Run dev

```bash
pnpm dev
```

Expected: server reachable at http://localhost:5678, worker logs show jobs being processed.

- [ ] Step 4: Run tests

```bash
pnpm test --ci --runInBand
```

Expected: all tests pass.

- [ ] Step 5: Build the production image

```bash
docker build --build-arg ROOT_URL=http://localhost:5678 --tag ilmo-prod .
```

Expected: image builds, size noticeably smaller than the previous multi-stage image.

- [ ] Step 6: Verify the image starts and responds to SIGTERM

```bash
docker run --rm -d --name ilmo-prod-test \
  -e DATABASE_HOST=host.docker.internal \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -p 5679:5678 \
  ilmo-prod
sleep 10
time docker stop ilmo-prod-test
```

Expected: `docker stop` returns within 2 seconds. This is the proof that the unkillable-container fix worked.

- [ ] Step 7: Open the PR

```bash
git push -u origin <branch-name>
gh pr create --title "Phase 1: migrate to pnpm, drop Nx/Cypress, simplify Docker" --body-file <(cat <<'EOF'
## Summary
- Migrate package manager from Yarn 3 to pnpm 10.
- Bump Node from 14 to 20 LTS.
- Remove Nx, Cypress, the dev-container pattern, and the multi-stage Dockerfile.
- Replace the production Dockerfile with a single-stage image using tini as PID 1, fixing the unkillable-container behavior.

See ADR-001-toolchain-rework.md for context.

## Test plan
- [ ] `pnpm install` from a clean clone
- [ ] `pnpm dev` starts the server on :5678
- [ ] `pnpm test --ci --runInBand` passes
- [ ] Production Docker image builds
- [ ] `docker stop` on a running container completes within 2 seconds
- [ ] CI green on the PR
EOF
)
```

## Risks and rollback

If install or build fails on a workspace because pnpm's hoisting differs from yarn's, the fix is to add the missing dep to that workspace's `package.json`. This is benign and expected.

If the production image fails to start because environment variables that yarn's shell wrapper provided are missing, the failure surfaces immediately at container start; logs will show the exact missing variable. None are expected, but the previous shell-form ENTRYPOINT did inherit the full shell environment, while exec-form does not.

Rollback is `git revert` of the merge commit. The branch can also be left unmerged indefinitely; the migration is on a single branch and does not affect main until merged.

## What is explicitly not in this plan

- Updating any non-toolchain dependency. PostGraphile, Next.js, ESLint, Jest, TypeScript stay on their current versions.
- Changing application code, including the `SubscriptionsPlugin` that depends on wal2json.
- Reworking the Ansible self-deploy pattern.
- Adding observability or addressing the every-two-weeks crash beyond what falls out of the Node bump and the tini PID 1 fix.

These belong to phases 2 and 3.
