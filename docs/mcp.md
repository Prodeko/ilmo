# MCP server

Ilmo serves a [Model Context Protocol](https://modelcontextprotocol.io) server
at `https://ilmo.prodeko.org/mcp`. It lets an AI assistant such as Claude list
events and register the signed-in member to them. Members sign in with their
Prodeko account through Keycloak, the same login the web app uses.

Tools:

- `list_events` — published events whose registration is open or upcoming.
- `get_event` — one event with its description, quotas and registration
  questions.
- `register_to_event` — registers to a quota. Answers are validated before a
  spot is claimed, and a failed registration releases the spot it claimed.

Admins also get:

- `list_event_options` — organizations and their event categories, with the ids
  `create_event` needs.
- `create_event` — creates an event with its quotas and questions. The event is
  always an unpublished draft; an admin reviews and publishes it in the admin
  UI, which the result links to.

Admin tools are listed and run only when the access token carries the
`ilmo-admin` realm role, so revoking the role in membership-registry takes
effect on the next request. The database's own `users.is_admin` check applies on
top, and MCP never writes that flag: an admin must have signed in to the web app
since getting the role.

Editing or cancelling a registration, and editing or publishing an event, are
not available over MCP.

## Using it

### claude.ai, Claude Desktop and mobile

Settings → Connectors → **Add custom connector**:

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| Name           | `Ilmo`                                                      |
| URL            | `https://ilmo.prodeko.org/mcp` (exactly, no trailing slash) |
| Authentication | **Sign in now**                                             |
| OAuth client   | **Use your own OAuth client**, client ID `ilmo-mcp`         |
| Client secret  | empty                                                       |
| Transport      | Streamable HTTP                                             |

Connect, sign in with the Prodeko account and accept the consent screen. The
sign-in lasts 30 days, after which Claude asks to sign in again.

### Claude Code

```sh
claude mcp add --transport http ilmo https://ilmo.prodeko.org/mcp \
  --client-id ilmo-mcp --callback-port 33418
```

Then run `/mcp`, choose ilmo → Authenticate. The callback port is fixed because
Keycloak matches redirect URIs exactly.

## Registering the Keycloak client

The MCP server needs its own client, `ilmo-mcp`, in the `membership-registry`
realm. It is separate from the web client `ilmokilke`: it is public, because MCP
clients run on members' machines or in Claude's service and cannot keep a
secret, and its access tokens carry the MCP resource as their audience so that
`/mcp` accepts no token issued to another client of the realm.

The labels below are those of the Keycloak 26 admin console.

1. **Realm settings → Sessions**: Offline Session Max Limited **Enabled**, with
   Offline Session Max longer than 30 days. Without this flag Keycloak ignores
   the client-level maximum below. The flag applies to every client's offline
   tokens, so check that no other client needs offline tokens without a lifespan
   before turning it on.
2. **Realm settings → User registration → Default roles** must contain
   `offline_access`. Claude requests that scope, and the code exchange fails
   with "Offline tokens not allowed for the user or client" for a member without
   the role. Roles are owned by membership-registry; add it there.
3. **Clients → Create client**
   - General settings: Client type OpenID Connect, Client ID `ilmo-mcp`, Name
     `Ilmokilke MCP`, Always Display in Console on (members can revoke it from
     the account console).
   - Capability config: Client authentication **off**, Authorization off, only
     **Standard Flow** enabled, PKCE method **S256**.
   - Login settings: Home URL `https://ilmo.prodeko.org`; Valid redirect URIs
     `https://claude.ai/api/mcp/auth_callback` (claude.ai, Desktop, mobile) and
     `http://localhost:33418/callback` (Claude Code); Web origins empty.
4. **Settings → Login settings**: Consent required **on**, Display client on
   screen on, Client consent screen text "Ilmon MCP-palvelin voi lukea
   tapahtumia ja ilmoittaa sinut tapahtumiin puolestasi. / The ilmo MCP server
   can read events and register you to events on your behalf."
5. **Advanced → Advanced settings**: Client Offline Session Idle **30 days**,
   Client Offline Session Max **30 days**.
6. **Client scopes → `ilmo-mcp-dedicated` → Configure a new mapper → Audience**:
   Included Custom Audience `https://ilmo.prodeko.org/mcp`, Add to access token
   on, Add to ID token off. A hardcoded audience is used instead of Audience
   Resolve because the latter adds client IDs only, from client roles, and with
   Full scope allowed would put ilmo's audience into other clients' tokens too.
7. **Client scopes**: `basic`, `email`, `profile`, `roles` as Default and
   `offline_access` as Optional.
8. **Client scopes → `ilmo-mcp-dedicated` → Scope**: if Full scope allowed is
   off, **Assign role** → realm role `ilmo-admin`. Without it admins' tokens
   omit the role and the admin tools stay hidden. Do not turn Full scope allowed
   on instead; it would put every realm role into these tokens.
9. **Client scopes → Evaluate**: pick a member, add `offline_access` to the
   scope parameter and open Generated access token. It must contain
   `"aud": "https://ilmo.prodeko.org/mcp"`, `"typ": "Bearer"`, `sid`, `email`
   and `"email_verified": true`; ilmo refuses tokens without them. For an admin,
   `realm_access.roles` must also contain `ilmo-admin`.

If a WAF or IP filter sits in front of `id.prodeko.org` or `ilmo.prodeko.org`,
allow Anthropic's egress range `160.79.104.0/21`: claude.ai fetches Keycloak's
discovery document and tokens from its servers.

Ilmo itself needs no new configuration: `/mcp` is enabled whenever
`KEYCLOAK_ISSUER` is set, and until the client exists every request is simply
answered with 401.

## How it works

- `/mcp` is a stateless Streamable HTTP endpoint (`installMcp.ts`). Requests
  without a valid token get 401 with a `resource_metadata` pointer to
  `/.well-known/oauth-protected-resource/mcp`, which names Keycloak as the
  authorization server.
- The token's signature, issuer, audience, expiry and `typ` are verified against
  Keycloak's JWKS (`mcp/auth.ts`).
- The token's `sub` resolves to the ilmo user through
  `app_public.user_authentications`. A member who has never signed in is created
  with `link_or_register_user`, like the web SSO callback does; an already
  linked identity skips it, because that function overwrites the stored id token
  the web logout relies on. Break-glass accounts are refused.
- Each Keycloak session (`sid`) maps to one `app_private.sessions` row of kind
  `mcp`. Tools run the regular GraphQL operations as that session, so RLS,
  ownership columns, rate limiting, the registration queue and the confirmation
  email behave exactly as on the web. The session id never leaves the server.
  Rows idle for an hour are deleted by `sessions__delete_inactive_mcp_sessions`
  and recreated on the next request.
- `claimRegistrationToken` is rate limited per user for signed-in requests (per
  IP for anonymous ones), so members whose requests all come from Claude's IP
  range do not share one limit.

## Local development

`docker compose --profile keycloak up -d` starts a Keycloak with the realm in
`docker/keycloak/realm-dev.json`: the web client `ilmo-dev`, the MCP client
`ilmo-mcp` and the users `dev-member` / `dev-member-password` and `dev-admin` /
`dev-admin-password`. Set

```sh
KEYCLOAK_ISSUER=http://localhost:8190/realms/ilmo-dev
```

in `.env` to enable `/mcp`; web SSO stays off until `KEYCLOAK_CLIENT_ID` and
`KEYCLOAK_CLIENT_SECRET` are set as well. Then add the server to Claude Code
with `http://localhost:5678/mcp` and the flags above.

claude.ai cannot reach `localhost`. Testing it locally needs public tunnels to
both ilmo and Keycloak, with `ROOT_URL`, `KEYCLOAK_ISSUER`, Keycloak's hostname
and the client's audience and redirect URIs switched to the tunnel URLs for the
duration of the test. Turn `ENABLE_CYPRESS_COMMANDS` off and replace the
Keycloak admin password before opening a tunnel.
