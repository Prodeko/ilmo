import { parse } from "cookie"
import Cookies from "js-cookie"
import { NextPageContext } from "next"
import { objectHasKey } from "."

declare module "http" {
  interface IncomingMessage {
    cookies?: {
      session?: string
      csrfToken?: string
    }
  }
}

const isSSR = typeof window === "undefined"

const serializeCookie = (name: string, val: string) =>
  `${encodeURIComponent(name)}=${encodeURIComponent(val)}`

function handleCookiesClient() {
  const session = Cookies.get("session") ?? ""
  const csrfToken = Cookies.get("csrfToken") ?? ""
  return [session, csrfToken]
}

function handleCookiesSSR(ctx: NextPageContext | undefined) {
  const requestCookies = ctx?.req?.cookies
  let { session, csrfToken } = requestCookies || {}

  const handleCookie = (cookie: string) => {
    const parsed = parse(cookie)
    const isCsrfCookie = objectHasKey(parsed, "csrfToken")
    const isSessionCookie = objectHasKey(parsed, "session")
    if (isCsrfCookie) {
      csrfToken = parsed["csrfToken"]
    } else if (isSessionCookie) {
      session = parsed["session"]
    }
  }

  if (!session || !csrfToken) {
    // If the cookies don't exist during SSR it means that this is
    // the first request the user makes. Their cookies should be in
    // the Set-Cookie header. Read the cookies from the response header
    // and serialize them
    const setCookie = ctx?.res?.getHeaders()["set-cookie"]
    if (!!setCookie) {
      if (typeof setCookie === "string") {
        // When Set-Cookie contains only a single cookie, it is of type string
        handleCookie(setCookie)
      } else if (Array.isArray(setCookie)) {
        // ... and when multiple cookies are present, they are in an array
        setCookie.forEach((cookie) => {
          handleCookie(cookie)
        })
      }
    }
  }
  session = serializeCookie("session", session ?? "")
  return [session, csrfToken ?? ""]
}

export function getSessionAndCSRFToken(
  ctx: NextPageContext | undefined
): string[] {
  if (!isSSR) {
    return handleCookiesClient()
  } else {
    return handleCookiesSSR(ctx)
  }
}

export function removeCsrfCookie() {
  Cookies.remove("csrfToken")
}
