# Phase 2 toolchain rework: dependency update roadmap

Date: 2026-05-02 Status: Draft

This is the roadmap spec for phase 2 of ADR-001. It defines the slices,
sequencing, success criteria, and verification approach for the dependency
update wave. It does not define the implementation details of any single
migration; each slice gets its own brainstorm and plan when its turn comes.

## Goal and non-goals

The goal is to bring every currently stale dependency to its current supported
version. The end state is a dependency tree where the only intentional version
pins are the ones PostGraphile v4 forces.

Out of scope:

- PostGraphile v4 to v5. Deferred to its own ADR per ADR-001.
- React 18 to 19. Pragmatic stay on 18 because v19 would mean a rewrite.
- Pages router to app router in Next.js. Separate project, not a dependency
  bump.
- Jest to Vitest. Jest works; no reason to switch.
- Server CommonJS to ESM. Required to bump chalk past v4 or got past v11; out
  of scope for phase 2.
- Application code changes that are not required by a migration.
- Phase 3 deployment work.

## Slice inventory

Phase 2 lands on a single branch as eight commits, in the order below. Each
slice maps to one or a small handful of commits.

1. ESLint 9 plus ts-eslint v8. Flat config rewrite, plugin bumps across the
   board.
2. Jest 29. Unify root and `@app/server` on jest 29 plus ts-jest 29.
3. fastify v5. Server only. Bumps `fastify`, `fastify-plugin`, every
   `@fastify/*` plugin to its v5-compatible major.
4. graphile-worker 0.13 to 0.16. Worker only. Picks up several schema
   migrations.
5. antd v4 to v5. Touches `@app/components` and `@app/client`. Removes
   `next-plugin-antd-less`, `less`, `less-loader`, and the
   `antd-dayjs-webpack-plugin` GitHub fork. Replaces less variables with
   antd v5 design tokens.
6. Next.js 12 to 15. Bumps `@sentry/nextjs` to v9, `next-translate` to v2,
   `@next/bundle-analyzer` to v15. Removes `next-transpile-modules`.
7. urql v4 plus graphql-codegen 5. Migrates the codegen output to the current
   urql plugin shape.
8. Overrides cleanup. Reduces `pnpm.overrides` to only the entries
   PostGraphile v4 forces.

## Commit order rationale

Three rules drive the order:

Tooling first (slices 1 and 2). Every later commit gets linted and tested
against the new config at write time rather than retrofitted. ESLint 9 will
surface a wave of style nits across every workspace; doing those edits now
means later high-churn commits do not have to deal with them on top of their
semantic changes.

Backend in the middle (slices 3 and 4). Independent of the frontend chain at
the file level. Small in size. Gets the backend stable while attention is on
infrastructure shape, before the long frontend slog. Order between 3 and 4
does not matter; fastify is listed first only because it is the larger of the
two.

Frontend chain last and forced sequential (slices 5, 6, 7). This is the only
ordering inside the branch that matters for correctness:

- antd v5 must precede the Next.js bump because antd v5 is what removes
  `less-loader`, `next-plugin-antd-less`, and the `antd-dayjs-webpack-plugin`
  fork. Doing Next.js first would mean redoing webpack and `next.config`
  gymnastics for less, then redoing them again when antd lands.
- urql v4 plus codegen 5 should follow Next.js because codegen output
  regenerates and the diff should be reviewed once, not twice.

Cleanup last (slice 8). Each override removal depends on a slice having
landed. Collapsing them into a single hygiene commit at the end keeps the
lockfile diff readable.

## Overrides retirement

The current `pnpm.overrides` block contains seven entries. After phase 2 it
contains two.

Removed by slice 5 (antd v5):

- `antd-dayjs-webpack-plugin`. Plugin and its GitHub fork are deleted from
  `@app/client`.
- `dayjs`. The exact pin existed only because the antd-dayjs fork required
  it. Declaration relaxes to a normal caret range.

Removed by slice 8:

- `faker`. Test fixtures migrate from the deprecated `faker` package to
  `@faker-js/faker`. The override and the unmaintained `faker` package go
  away together.
- `chalk`. The `@app/server` declaration of `^5.0.1` is dishonest; the server
  is CommonJS and chalk v5 is ESM only, so the override forces v4 anyway.
  Slice 8 aligns the declaration to `^4` and removes the override.
- `got`. Same situation. Server declares `^12.3.1`, override forces v11,
  installed version is v11. Slice 8 aligns the declaration to `^11` and
  removes the override.

Kept after phase 2:

- `graphql: 15.x`. Required by PostGraphile v4. Lifted only when the
  deferred PostGraphile v5 ADR is implemented.
- `graphql-upload: 13.x`. Same reason.

## Per-slice success criteria and risks

Each slice has a landing-state checklist and a list of surprises that will
actually cost time. The slice-level brainstorm and plan will refine these.

### Slice 1: ESLint 9 plus ts-eslint v8

Done when `.eslintrc.js` is deleted, `eslint.config.js` is at the root, every
`eslint-plugin-*` and `@typescript-eslint/*` is on its current major, and
`pnpm lint` passes across all workspaces. The deprecated `eslint --ext` flag
in the root script is replaced with flat-config glob patterns.

Risks:

- Flat config does not auto-migrate from `.eslintrc.js`. The current Cypress
  and GraphQL overrides need hand-porting.
- ts-eslint v8 enables several rules by default that will surface a wave of
  violations. Decide once whether to fix or disable each.
- `@graphql-eslint/eslint-plugin` has its own flat-config story and may not
  be on the same release cadence. Verify v9 support before starting.

### Slice 2: Jest 29

Done when root and `@app/server` are unified on jest 29 plus ts-jest 29 plus
`@types/jest` 29, `jest.config.base.ts` is migrated, and `pnpm test` is green.

Risks:

- ts-jest v29 moved from the `globals` config to the `transform` config
  shape. This is the most likely silent breakage.
- Snapshot diffing is stricter; expect a small re-snapshot pass.

### Slice 3: fastify v5

Done when `fastify` and `fastify-plugin` are on v5, every `@fastify/*` plugin
is on its v5 major, the server boots and serves requests, and the server test
suite passes.

Risks:

- `fastify-next@0.1.4` is unmaintained. Last release was 2021. It almost
  certainly does not work with fastify v5 or Next.js 15. The slice has to
  decide between writing a small DIY Fastify and Next bridge plugin or
  running Next.js as a standalone process behind a Fastify reverse proxy.
  This is the single biggest unknown in phase 2 outside the deferred
  PostGraphile work. The decision belongs in the slice 3 brainstorm, not
  here.
- The standalone `helmet@5` dependency is a duplicate of `@fastify/helmet`
  and should be deleted.

### Slice 4: graphile-worker 0.13 to 0.16

Done when the worker boots, applies its schema migrations on first run, and
processes a test job successfully.

Risks:

- Several schema migrations between 0.13 and 0.16. The production deploy
  must run them on first boot.
- The `pgPool` option was removed in 0.14. Use `connectionString` instead.

### Slice 5: antd v4 to v5

Done when `antd@5` and `@ant-design/icons@5` are installed,
`next-plugin-antd-less` and `less` and `less-loader` and
`antd-dayjs-webpack-plugin` are deleted from `@app/client`, the antd-less
plugin chain is gone from `next.config.js`, the less variable customizations
are replaced by antd v5 design tokens via `<ConfigProvider theme={...}>`, and
every antd usage compiles and renders. Login, event browse, registration
form, and admin pages are spot-checked in a browser.

Risks:

- The largest slice by file count.
- API changes in Form.Item, DatePicker locale, Modal.confirm and
  Modal.info return shape, and Dropdown menu props are mechanical but
  pervasive. DatePicker locale must move to ConfigProvider.
- Less variables to design tokens is not a one to one mapping. Some custom
  variables need design judgment.
- antd v5 SSR requires `@ant-design/cssinjs` `extractStyle` in
  `_document.tsx`. This pattern lands in slice 5 and must survive slice 6.
- `rc-table` may be removable since antd v5 vendors it. Verify before
  deleting.
- `react-color-palette@6` peer-dep should be checked against antd v5.

### Slice 6: Next.js 12 to 15

Done when the production build succeeds, the dev server serves every page,
pages-router routes still work, the Sentry instrumentation file pattern is
in place, and `next-transpile-modules` is deleted in favor of
`transpilePackages` in `next.config.js`.

Risks:

- next-translate v2 maintenance status. Verify upstream before relying on
  it. If it is stale, switch to `next-i18next` or stay on `next-translate@1`
  and accept the pin.
- `next/image` shape changed in 13. Custom loaders and `layout="fill"` usage
  break.
- Sentry v7 to v9 is two major bumps. The `sentry.client.config.ts` and
  `instrumentation.ts` split is non-trivial. Source-map upload config
  changed.
- Coupling with slice 3: whatever fastify-next replacement slice 3 picks
  must match what Next.js 15 expects. Re-verify the integration at the
  start of slice 6 before writing any code for it.

### Slice 7: urql v4 plus graphql-codegen 5

Done when `urql@4` and `next-urql` (current) are installed, every
`@graphql-codegen/*` is on v5, `codegen.yml` is migrated, regenerated
artifacts compile and run, and dev queries work.

Risks:

- The project uses graphcache. The graphcache exchange API changed in urql
  v4 and the codegen plugin may have moved or merged into the urql preset.
- `next-urql` is in maintenance limbo. Confirm urql v4 support before
  relying on it. If it is stale, DIY the SSR integration; the surface area
  is small.
- The codegen output diff in this commit will be large. Review for
  unexpected schema-side changes.

### Slice 8: overrides cleanup

Done when `pnpm.overrides` contains only `graphql: 15.x` and
`graphql-upload: 13.x`, `@app/server` declares `chalk: ^4` and `got: ^11`
honestly, fixtures are migrated from `faker` to `@faker-js/faker`,
`pnpm install` is clean, and all tests pass.

Risks:

- `@faker-js/faker` v8 and later renamed several namespaces.
  `faker.name.*` is now `faker.person.*`; `faker.address.*` is now
  `faker.location.*`. Fixtures need a mechanical sweep.
- The lockfile diff in this commit is the artifact that proves phase 2
  worked. Review it carefully.

## Cross-slice coordination

Two pairs need explicit handoff and should be re-verified at the start of the
later slice:

- Slice 5 to slice 6. The antd cssinjs SSR setup in `_document.tsx` lands in
  slice 5 and must survive the Next.js 15 bump in slice 6.
- Slice 3 to slice 6. The fastify-next replacement decision in slice 3 must
  match Next.js 15 expectations in slice 6.

## Verification approach

### Per-slice gate

Run before committing each slice:

1. `pnpm install` and review the lockfile diff. Unexpected hoist changes
   get explained, not waved through.
2. `pnpm tsc -b` typechecks across all workspaces.
3. `pnpm lint` passes.
4. `pnpm test` passes.
5. `pnpm dev` boots cleanly to a served page (frontend slices) or a healthy
   endpoint (backend slices).
6. For slices 3, 5, and 6: the Cypress e2e suite runs green. The four specs
   that were just unflakied in commit 825aa499 are the canary. If any of
   them break, that is the slice's bug, not a Cypress flake.
7. For slices 5 and 6: manual spot-check of login, event browse,
   registration form, and admin pages in a browser.

### Branch-level gate

Run before opening the pull request and before slice 8:

- The production Dockerfile builds and the resulting image boots under
  `docker-compose.prod.yml`.
- The worker container processes a queued job end to end.
- The full lockfile is reviewed. Any remaining override or unexpected
  version pin gets a written justification or gets removed.

### Not gates

The following are explicitly not phase 2 gates:

- Bundle size. The Next.js bump and antd v5 will both shift bundle size.
  Flag absurd regressions, more than 30% on first-load JS, but do not tune.
- Visual pixel parity. Antd v5's default theme is different. The goal is no
  functional regression.
- Test coverage. Phase 2 does not add tests. If existing tests pass on the
  new versions, that is the bar.

### Overriding principles

- No fix-it-later commits within phase 2. If a slice exposes a bug, fix it
  in the same slice's commit even if it grows. Splitting "broken in slice 5,
  fixed in slice 8" makes bisecting impossible and defeats the per-slice
  gate.
- Each slice's commit must be green at HEAD. No "tests broken, will fix in
  next commit" handoffs. The branch is one pull request, but every commit
  on it bisects cleanly.

## Next steps

After this spec is approved, the next document is the per-slice
implementation plan for slice 1 (ESLint 9 plus ts-eslint v8). Each subsequent
slice gets its own brainstorm, spec, and plan in turn. PostGraphile v4 to v5
remains deferred to a separate ADR per ADR-001.
