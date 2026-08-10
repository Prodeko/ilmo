# Keycloak SSO

Ilmo authenticates users through OpenID Connect against the Prodeko Keycloak at
`id.prodeko.org`, realm `membership-registry`. Any member of the realm can sign
in without pre-provisioning; the realm role `ilmo-admin` grants admin access,
and the member's `locale` attribute selects the UI language. Accounts come into
existence exclusively through SSO login — ilmo has no self-service registration
page and no registration mutation. Local username/password login is a
semi-hidden break-glass path for the two operations accounts.

This is the operator guide: what to configure, where, and in which order.

## Environment variables

The server reads three variables:

- `KEYCLOAK_ISSUER` — the realm issuer URL, with no trailing slash. Production
  is `https://id.prodeko.org/realms/membership-registry`; local development
  against membership-registry's dev Keycloak is
  `http://localhost:8180/realms/membership-registry`. A plain-`http` issuer is
  accepted outside production only; in production, discovery against an `http`
  issuer fails.
- `KEYCLOAK_CLIENT_ID` — the client ID registered in the realm, `ilmokilke`.
- `KEYCLOAK_CLIENT_SECRET` — the client secret from the Keycloak admin console.

The callback and post-logout URLs are derived from the existing `ROOT_URL`, so
there is nothing else to set. `pnpm setup:env` writes the three keys empty into
`.env`.

SSO mounts only when all three variables are non-empty. If any is missing the
server logs at boot — at error level in production, at warning level elsewhere —
skips the `/auth/keycloak` routes (they return 404), and `/login` renders the
username/password form directly. A deploy without Keycloak configuration
therefore degrades to plain password login rather than a dead redirect.

## Admin access

Admin rights come from the realm role `ilmo-admin`. Create that role in the
membership-registry admin UI, not in Keycloak: the registry's role sync creates
and owns the matching Keycloak realm role, and a role created directly in
Keycloak is invisible to the registry and unmanaged. Give it a description such
as "Admin access to ilmokilke".

Assign and revoke the role in the registry UI, either directly on a member or
through a role group. Ilmo re-stamps `users.is_admin` from the ID token on every
SSO login, so both promotion and demotion take effect the next time the member
logs in to ilmo. There is no live re-check. The re-stamp only runs when the ID
token actually carries a `realm_access.roles` claim: if the client's realm-roles
mapper is missing, ilmo leaves every user's `is_admin` untouched and logs an
error on each login instead of silently demoting the admins one by one.

Ilmo has its own admin toggle on `/admin/users/list`, backed by
`app_public.set_admin_status`, which writes `users.is_admin` directly. The
re-stamp overwrites whatever that toggle set, so a grant made inside ilmo lasts
only until that user's next SSO login. The `ilmo-admin` assignment in the
registry is the only durable source of admin rights; use the toggle only for
accounts that never log in through SSO.

The two break-glass accounts are exempt from the re-stamp: an SSO login that
would land on them is refused and their `is_admin` is left alone.

Organization membership is unrelated to Keycloak and stays in ilmo's own
database.

## Account linking

A first SSO login binds to an existing ilmo account in two ways. When the
Keycloak identity is already linked, the login lands on the linked account.
Otherwise `app_private.link_or_register_user` adopts an existing account whose
_verified_ ilmo email matches the Keycloak email — this is what lets members
with pre-SSO accounts keep them — and only when neither matches does it create a
new account. Adoption re-stamps `is_admin` like any login, which is why the
rollout audit below covers every admin account, not just the break-glass pair.

Separately, a signed-in user attaches a Keycloak identity to _the account they
are currently signed into_ from `/settings/accounts`, which sends them to
`/auth/keycloak?link=1&next=...`. The `link=1` flag is what authorises binding
to the session's account; a plain `/auth/keycloak` visit while signed in just
redirects to `next`. The flag only counts on a same-origin navigation
(`Sec-Fetch-Site`, with a referer fallback) — a cross-site page cannot forge the
link intent for a visitor who happens to be signed in to both ilmo and Keycloak.
A link request that cannot be honoured fails visibly rather than degrading to a
plain login: an unverifiable navigation returns to `/settings/accounts` with an
error, and a session that expired mid-flow lands on
`/login?error=link_session_lost`.

Linking re-stamps `users.is_admin` from the ID token exactly as a login does, so
a local admin who links an identity that lacks `ilmo-admin` loses admin rights
on the spot.

## Registering the Keycloak client

Follow `docs/keycloak-clients.md` in the membership-registry repository. The
client settings ilmo requires:

- Confidential client (client authentication on), standard flow only, direct
  access grants off.
- PKCE with code challenge method S256.
- Valid redirect URI exactly `${ROOT_URL}/auth/keycloak/callback`.
- Valid post-logout redirect URI `${ROOT_URL}/`.
- Web origins set to the ilmo origin.

Then add two protocol mappers to the client, mirroring
`@app/e2e/keycloak/realm-ci.json`:

- Roles: type `oidc-usermodel-realm-role-mapper`, token claim name
  `realm_access.roles`, multivalued, **added to the ID token**. Keycloak's
  default `roles` client scope puts realm roles in the access token only, and
  ilmo reads them from the ID token — without this mapper the token carries no
  `realm_access` at all, nobody gets admin, and every login logs an error. The
  mapper delivers the effective role set, including roles inherited from groups
  and composites.
- Locale: type `oidc-usermodel-attribute-mapper`, user attribute `locale`, token
  claim name `locale`, added to the ID token. The registry syncs each member's
  language into that user attribute but maps the claim only on its own client.
  Ilmo understands the values `fi`, `en` and `se`; on any other value, or a
  missing claim, ilmo sets no language and the member keeps whatever their
  browser negotiated.

Finally copy the client secret into the ilmo secret store as
`KEYCLOAK_CLIENT_SECRET`.

For local development, register a second client in membership-registry's dev
Keycloak with redirect URI `http://localhost:5678/auth/keycloak/callback` and
point `KEYCLOAK_ISSUER` at `http://localhost:8180/realms/membership-registry`.

## Break-glass login

With SSO enabled, `/login` sends visitors straight to Keycloak and the password
form is not linked from anywhere. Two entry points reveal it:

- `/login?local=1`, which renders the password form directly. This is the entry
  point runbooks should reference: it works with no Keycloak reachable and no
  prior session.
- A failed SSO attempt. Any `/login?error=...` stops the automatic bounce to
  Keycloak and renders the error instead, and the `sso_unavailable` error offers
  a visible link to `/login?local=1`.

The form accepts any local account and is the ordinary password login, rate
limiting and lockout included. It exists for the operations accounts ProdekoCTO
and ProdekoToimari, whose passwords live in the credential store rather than in
Keycloak. Those two usernames are blocked from SSO: a Keycloak login that would
land on them is refused with `account_conflict` and the whole callback
transaction is rolled back, so no identity link is left behind and their admin
flags cannot be flipped by an email collision.

Hiding the form is decluttering, not a security boundary. The form itself links
to `/forgot`; `/reset` is reached from the emailed reset link, and
`/settings/security` needs an active session.

## Login error codes

A failed SSO attempt returns to `/login?error=<code>` with a message. What each
code means on the operator's side:

- `sso_unavailable` — the authorization request could not be built or the token
  endpoint could not be reached. Keycloak is unreachable or the issuer URL is
  wrong — but a failure in ilmo's own database while preparing the redirect
  lands here too, so check both before chasing Keycloak. This is the only error
  page that offers the local sign-in link.
- `state_mismatch` — the callback arrived with no in-flight login state in the
  session: a bookmarked or replayed callback URL, or a session cookie that was
  dropped or rotated mid-flow.
- `code_exchange_failed` — the token endpoint rejected the exchange: the
  authorization code, PKCE verifier or nonce did not validate, or the client
  credentials are rejected (check `KEYCLOAK_CLIENT_SECRET` after a rotation).
- `missing_claims` — the ID token carries no `sub` or no `email`. The client
  scope in Keycloak is missing the corresponding mapper.
- `email_not_verified` — the member's registry email address is not verified,
  _or_ the ID token carries no `email_verified` claim at all. The second case is
  a client-scope mapper problem, not a registry one, and the server log says
  which occurred — check it first during initial client setup. For a verified
  member the fix is in the registry, not in ilmo. Expect this to be the most
  common support ticket.
- `account_conflict` — the login landed on a break-glass account, or the
  Keycloak identity is already linked to a different ilmo account.
- `link_session_lost` — an account-link attempt whose app session had expired by
  the time the flow finished. The user signs in again and retries from
  `/settings/accounts`.
- `login_failed` — anything else. Details are in the server log only.

A member who presses Cancel on the Keycloak page is sent to the front page with
no error; only actual failures reach `/login?error=`.

## Rollout

1. Deploy with no `KEYCLOAK_*` variables set. Login stays on the password form
   and no user-visible behaviour depends on Keycloak yet.
2. Create the `ilmo-admin` role in the membership-registry admin UI and assign
   it to the members who need admin access.
3. Register the `ilmokilke` client in the realm, add the realm-roles and
   `locale` mappers, and copy the secret into the secret store.
4. Verify that neither ProdekoCTO nor ProdekoToimari carries an email address
   that collides with a member's Keycloak email, and rotate both passwords into
   the break-glass credential store. Then audit every other local account with
   `is_admin` whose verified email matches a realm member: the member's first
   SSO login adopts that account and re-stamps its admin flag, so grant those
   members `ilmo-admin` in the registry before cutover or they are demoted.
5. Set the three `KEYCLOAK_*` variables in production and restart. SSO is now
   the login path.
6. Expect 404s on `/register`: there is no registration page, so bookmarks and
   old links to one have no destination. Accounts are created by SSO login.
7. Watch login error logs and the admin user set for a week.

SSO touches only existing tables and functions —
`app_private.link_or_register_user`, `app_public.users`,
`app_public.user_authentications`, `app_private.user_authentication_secrets`
(where the ID token used as the logout hint is stored) and
`app_private.sessions` — so there is no migration to run, and rollback is
unsetting the three variables. The callback does all of that work in one
transaction, so a refused login leaves no rows behind.

## Staging checklist

Run these manually against staging before the production cutover:

- A member without `ilmo-admin` lands as a normal user; a member with it lands
  as an admin.
- Granting `ilmo-admin` in the registry UI and logging in again produces admin
  access; revoking it and logging in again removes it.
- A member whose language is English lands in an English UI, a Finnish member in
  a Finnish one.
- The event registration form prefills name and email for a logged-in member.
- Break-glass login works via `/login?local=1`, and ProdekoCTO still has admin.
- A member whose registry email is unverified is refused with
  `email_not_verified`.
- A signed-in local account links a Keycloak identity from `/settings/accounts`
  and stays on the same account.
- Logging out of an SSO session round-trips through Keycloak and ends both
  sessions; logging out of a break-glass session leaves Keycloak untouched.

Keycloak's SSO session idle timeout governs how often a returning member sees
the Keycloak login page; ilmo's own session length is independent of it. The
authoritative value is the realm's session settings in the Keycloak admin
console.
