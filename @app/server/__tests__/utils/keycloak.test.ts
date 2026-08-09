import {
  keycloakEnabled,
  mapKeycloakClaims,
  sanitizeNext,
} from "../../src/utils/keycloak"

const baseClaims = {
  sub: "kc-uuid-1",
  email: "matti.meikalainen@example.com",
  email_verified: true,
  name: "Matti Meikäläinen",
  locale: "fi",
  realm_access: { roles: ["membership", "ilmo-admin"] },
}

describe("mapKeycloakClaims", () => {
  it("maps a full admin claim set", () => {
    expect(mapKeycloakClaims(baseClaims)).toEqual({
      sub: "kc-uuid-1",
      email: "matti.meikalainen@example.com",
      emailVerified: true,
      name: "Matti Meikäläinen",
      username: "matti.meikalainen",
      locale: "fi",
      isAdmin: true,
    })
  })

  it("is not admin without the ilmo-admin role", () => {
    const claims = { ...baseClaims, realm_access: { roles: ["membership"] } }
    expect(mapKeycloakClaims(claims).isAdmin).toBe(false)
  })

  it("is not admin when realm_access is absent", () => {
    const { realm_access: _dropped, ...claims } = baseClaims
    expect(mapKeycloakClaims(claims).isAdmin).toBe(false)
  })

  it("returns null locale for unsupported locales", () => {
    expect(mapKeycloakClaims({ ...baseClaims, locale: "de" }).locale).toBeNull()
    const { locale: _dropped, ...noLocale } = baseClaims
    expect(mapKeycloakClaims(noLocale).locale).toBeNull()
  })

  it("reports unverified email", () => {
    const claims = { ...baseClaims, email_verified: false }
    expect(mapKeycloakClaims(claims).emailVerified).toBe(false)
  })

  it("falls back to email localpart when name is missing", () => {
    const { name: _dropped, ...claims } = baseClaims
    expect(mapKeycloakClaims(claims).name).toBe("matti.meikalainen")
  })

  it("throws KCCLM when sub or email is missing", () => {
    const { email: _dropped, ...noEmail } = baseClaims
    const { sub: _dropped2, ...noSub } = baseClaims
    for (const claims of [noEmail, noSub]) {
      let thrown: any = null
      try {
        mapKeycloakClaims(claims)
      } catch (e) {
        thrown = e
      }
      expect(thrown).not.toBeNull()
      expect(thrown.code).toBe("KCCLM")
    }
  })
})

describe("sanitizeNext", () => {
  it("accepts a normal relative path", () => {
    expect(sanitizeNext("/event/foo")).toBe("/event/foo")
  })
  it("accepts a path containing a percent-encoded query", () => {
    expect(sanitizeNext("/event/foo?a=b%20c")).toBe("/event/foo?a=b%20c")
  })
  it.each([
    [undefined],
    [null],
    ["https://evil.example.com"],
    ["//evil.example.com"],
    ["/auth/keycloak"],
    ["/logout"],
    ["/"],
    // Browsers normalise "\" to "/" before resolving, so these are
    // protocol-relative URLs pointing at another origin.
    ["/\\evil.example.com"],
    ["/\\\\evil.example.com"],
    // Tab, CR and LF are stripped by the browser's URL parser, which turns
    // these back into "//evil.example.com".
    ["/\t/evil.example.com"],
    ["/\r\n/evil.example.com"],
    ["/\r/evil.example.com"],
    ["/\t\\evil.example.com"],
  ])("falls back to / for %p", (value) => {
    expect(sanitizeNext(value)).toBe("/")
  })
  it("strips embedded tab/CR/LF from an otherwise safe path", () => {
    expect(sanitizeNext("/event\t/foo")).toBe("/event/foo")
  })
})

describe("keycloakEnabled", () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })
  it("is true only when all three vars are set", () => {
    process.env.KEYCLOAK_ISSUER =
      "http://localhost:8180/realms/membership-registry"
    process.env.KEYCLOAK_CLIENT_ID = "ilmokilke"
    process.env.KEYCLOAK_CLIENT_SECRET = "s3cret"
    expect(keycloakEnabled()).toBe(true)
    delete process.env.KEYCLOAK_CLIENT_SECRET
    expect(keycloakEnabled()).toBe(false)
  })
})
