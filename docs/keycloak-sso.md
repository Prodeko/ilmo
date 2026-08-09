# Keycloak SSO

Ilmo authenticates users through OpenID Connect against the Prodeko Keycloak at
`id.prodeko.org`, realm `membership-registry`. Any member of the realm can sign
in without pre-provisioning; the realm role `ilmo-admin` grants admin access,
and the member's `locale` attribute selects the UI language. Local
username/password login survives only as a semi-hidden break-glass path for the
two operations accounts.

This is the operator guide: what to configure, where, and in which order.

## Environment variables

The server reads three variables:

- `KEYCLOAK_ISSUER` — the realm issuer URL, with no trailing slash. Production
  is `https://id.prodeko.org/realms/membership-registry`; local development
  against membership-registry's dev Keycloak is
  `http://localhost:8180/realms/membership-registry`.
- `KEYCLOAK_CLIENT_ID` — the client ID registered in the realm, `ilmokilke`.
- `KEYCLOAK_CLIENT_SECRET` — the client secret from the Keycloak admin console.

The callback and post-logout URLs are derived from the existing `ROOT_URL`, so
there is nothing else to set. `pnpm setup:env` writes the three keys empty into
`.env`.

SSO mounts only when all three variables are non-empty. If any is missing the
server logs a warning at boot, skips the `/auth/keycloak` routes (they return
404), and `/login` renders the username/password form directly. A deploy without
Keycloak configuration therefore degrades to plain password login rather than a
dead redirect.

## Admin access

Admin rights come from the realm role `ilmo-admin`. Create that role in the
membership-registry admin UI, not in Keycloak: the registry's role sync creates
and owns the matching Keycloak realm role, and a role created directly in
Keycloak is invisible to the registry and unmanaged. Give it a description such
as "Admin access to ilmokilke".

Assign and revoke the role in the registry UI, either directly on a member or
through a role group. Ilmo re-stamps `users.is_admin` from the ID token on every
SSO login, so both promotion and demotion take effect the next time the member
logs in to ilmo. There is no live re-check and no way to grant admin from within
ilmo itself.

Organization membership is unrelated to Keycloak and stays in ilmo's own
database.

## Registering the Keycloak client

Follow `docs/keycloak-clients.md` in the membership-registry repository. The
client settings ilmo requires:

- Confidential client (client authentication on), standard flow only, direct
  access grants off.
- PKCE with code challenge method S256.
- Valid redirect URI exactly `${ROOT_URL}/auth/keycloak/callback`.
- Valid post-logout redirect URI `${ROOT_URL}/`.
- Web origins set to the ilmo origin.

Then add one protocol mapper to the client: type
`oidc-usermodel-attribute-mapper`, user attribute `locale`, token claim name
`locale`, added to the ID token. The registry syncs each member's language into
that user attribute but maps the claim only on its own client, so without this
mapper every member lands in the default UI language. Roles need no mapper —
`realm_access.roles` arrives through the client's default full-scope
configuration and already contains the effective set, including roles inherited
from groups and composites.

Finally copy the client secret into the ilmo secret store as
`KEYCLOAK_CLIENT_SECRET`.

For local development, register a second client in membership-registry's dev
Keycloak with redirect URI `http://localhost:5678/auth/keycloak/callback` and
point `KEYCLOAK_ISSUER` at `http://localhost:8180/realms/membership-registry`.

## Break-glass login

With SSO enabled, `/login` sends visitors straight to Keycloak and the password
form is not linked from anywhere. Two paths reveal it:

- Right-click the sign-in button on `/login`.
- Open `/login?local=1` directly, which is the path to use on mobile and in
  runbooks.

The form accepts any local account and is the ordinary password login, rate
limiting and lockout included. It exists for the operations accounts ProdekoCTO
and ProdekoToimari, whose passwords live in the credential store rather than in
Keycloak. Those two usernames are blocked from SSO: a Keycloak login that would
link onto them is refused with `account_conflict` and the identity link is
undone, so their admin flags cannot be flipped by an email collision.

Hiding the form is decluttering, not a security boundary. Password reset and
change (`/forgot`, `/reset`, `/settings/security`) remain reachable from it.

## Rollout

1. Deploy with no `KEYCLOAK_*` variables set. Login stays on the password form
   and no user-visible behaviour depends on Keycloak yet.
2. Create the `ilmo-admin` role in the membership-registry admin UI and assign
   it to the members who need admin access.
3. Register the `ilmokilke` client in the realm, add the `locale` mapper, and
   copy the secret into the secret store.
4. Verify that neither ProdekoCTO nor ProdekoToimari carries an email address
   that collides with a member's Keycloak email, and rotate both passwords into
   the break-glass credential store.
5. Set the three `KEYCLOAK_*` variables in production and restart. SSO is now
   the login path.
6. Watch login error logs and the admin user set for a week.

The only database interaction goes through `app_private.link_or_register_user`,
so there is no migration to run and no rollback step beyond unsetting the three
variables.

## Staging checklist

Run these manually against staging before the production cutover:

- A member without `ilmo-admin` lands as a normal user; a member with it lands
  as an admin.
- Granting `ilmo-admin` in the registry UI and logging in again produces admin
  access; revoking it and logging in again removes it.
- A member whose language is English lands in an English UI, a Finnish member in
  a Finnish one.
- The event registration form prefills name and email for a logged-in member.
- Break-glass login works both by right-clicking the sign-in button and via
  `/login?local=1`, and ProdekoCTO still has admin.
- Logging out of an SSO session round-trips through Keycloak and ends both
  sessions; logging out of a break-glass session leaves Keycloak untouched.

Keycloak's SSO session idle timeout in this realm is 30 minutes. That only
governs how often a returning member sees the Keycloak login page; ilmo's own
session length is independent of it.
