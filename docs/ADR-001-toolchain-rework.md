# ADR-001: Migrate to pnpm and simplify development and deployment

Date: 2026-05-02
Status: Accepted

## Context

The application is actively used in production, runs on a single Azure VM as three Docker containers (`ilmo_server`, `ilmo_worker`, `ilmo_redis`), and is deployed via a GitHub Actions job that triggers an Ansible playbook on the VM itself.

The application crashes roughly every two weeks. When this happens, `docker restart ilmo_server` does not recover the container, and the entire Docker daemon must be restarted. That causes downtime for every other service on the VM.

The development setup is significantly more complex than the application warrants:

- Yarn 3 Berry with a committed `.yarn/` directory, `.yarnrc.yml`, and a workspace plugin.
- Nx 14 orchestrating builds, tests, and lint across seven workspaces for a single deployable application.
- A multi-stage production Dockerfile that installs `alpine-sdk`, `libtool`, `autoconf`, `automake`, `python3`, and `g++` to compile native dependencies.
- A development workflow that supports both running locally and running inside a `docker-compose` dev container, with overlapping but mutually incompatible commands.
- A Cypress end-to-end test suite that nobody currently maintains.
- Node 14, which has been end of life since April 2023.

The compounding effect is that nobody on the team has touched the project for a long time because the friction of getting it running and shipping a change is too high.

## Decision

Rework the toolchain, dependencies, and deployment infrastructure in three sequential phases. Each phase is its own pull request and must work end to end (local development, CI, production) before the next phase begins.

- Phase 1: toolchain simplification.
- Phase 2: dependency update wave.
- Phase 3: deployment rework.

The goal of phase 1 is that a new contributor can run `pnpm i && pnpm dev` from a fresh clone and have a working development environment.

## Phase 1: toolchain simplification

Switch the package manager from Yarn 3 to pnpm 10. Bump Node from 14 to 20 LTS, which is required by pnpm 10 and addresses runtime issues that may contribute to the production crash. Remove tooling that does not pay for itself at this scale.

The specific changes:

- Replace Yarn 3 with pnpm 10. Delete `.yarn/`, `yarn.lock`, and `.yarnrc.yml`. Add `pnpm-workspace.yaml`. Convert the `resolutions` field to `pnpm.overrides`. Convert the non-standard `workspace:@app/db` reference to `workspace:*`.
- Remove Nx. Delete `nx.json`, `workspace.json`, and the `@nrwl/*` and `nx` packages. Replace `yarn nxmany --target=X` with `pnpm -r --parallel run X` and `yarn workspace @app/foo` with `pnpm --filter @app/foo`.
- Remove Cypress. Delete the `@app/e2e` workspace and `.github/workflows/cypress.yml`.
- Remove the development container pattern. Delete `docker/dockerfiles/Dockerfile.dev`, `.devcontainer/`, and the `docker/` workspace. Reduce `docker-compose.yml` to two services: the wal2json Postgres image (kept because the server uses live queries) and Redis. The application itself runs on the host.
- Bump Node from 14 to 20 LTS in CI, the production Dockerfile, the `engines` field, and any other pinned location.
- Rewrite the production Dockerfile as a single stage. Use `tini` as PID 1 and the exec form of `ENTRYPOINT` so that signals reach the Node process. This addresses the unkillable container behavior.
- Update CI workflows to install pnpm via `pnpm/action-setup` and cache the pnpm store keyed on `pnpm-lock.yaml`.

Phase 1 explicitly does not change application code, database migrations, or any non-toolchain dependency version.

## Phase 2: dependency update wave

After phase 1 lands and stabilizes, update direct dependencies. The expected major migrations:

- PostGraphile v4 to v5, which is effectively a rewrite of every plugin.
- ESLint 8 to 9, which moves to flat config.
- Jest 27 to 29, or migration to Vitest.
- Next.js to the current stable release.
- TypeScript 4.7 to 5.x.
- The `pnpm.overrides` entries for `graphql`, `dayjs`, `chalk`, `got`, and `faker` either get bumped with the rest or removed if no longer needed.

Several of these migrations are independent and can ship as separate pull requests. PostGraphile in particular is large enough that it likely warrants its own ADR.

## Phase 3: deployment rework

After phase 2, replace the Azure VM Ansible self-deploy pattern with a conventional deployment. Open questions to resolve before this phase begins:

- Whether to keep the Azure VM or move to a managed platform such as Fly, Railway, or Render.
- Where Postgres lives in production. The current VM runs no Postgres container, so it is either on the host or external.
- Whether the worker stays as a separate container or merges into the server process.

This phase is intentionally undefined at the ADR level because the right answer depends on operational preferences that have not been discussed yet.

## Consequences

Onboarding goes from "read the README and pray" to `pnpm i && pnpm dev`. The unkillable-container restart pathology gets fixed as a side effect of rewriting the Dockerfile. Node 20 picks up several years of memory and garbage collection improvements that may resolve the every-two-weeks crash on its own.

The production image gets smaller because the build no longer needs `alpine-sdk` and friends to compile native dependencies. Node 20 ships prebuilt binaries for `sodium-native`, `bufferutil`, and `sharp`.

CI cache strategy changes. The yarn cache keyed on `yarn.lock` becomes a pnpm store cache keyed on `pnpm-lock.yaml`. The first CI run after merge will be a cold cache.

Phase 1 is a single large pull request. There is no incremental path that produces a working repository between yarn and pnpm; the cutover is atomic.

Risks worth naming:

- pnpm's stricter dependency hoisting may surface latent bugs where code imports transitive packages it does not declare. These are easy to fix by adding the missing dependency to the `package.json` of the affected workspace.
- The Node 14 to 20 jump crosses several behavioral changes including DNS resolution defaults, the global `fetch`, and `crypto` defaults. Each surfaces as a test failure or runtime error rather than silent corruption.
- The wal2json Postgres image is custom-built and tied to live queries. It is preserved in phase 1, so this is not a phase 1 risk, but phase 2 or 3 may force a decision about whether live queries are still worth the operational cost.

## Out of scope

- Application code changes.
- Database schema or migration changes.
- Switching cloud providers, decided in phase 3.
- Replacing PostGraphile, potential phase 2 work with its own ADR.
- Adding observability or improving crash diagnosis beyond what falls out of the Node bump.
