import { parse } from "cookie"
import Cookies from "js-cookie"
import { NextPageContext } from "next"

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
  const cookiesExist = !!session && !!csrfToken

  if (!cookiesExist) {
    // If the cookies don't exist during SSR it means that this is
    // the first request the user makes. Their cookies should be in
    // the Set-Cookie header. Read the cookies from the response header
    // and serialize them
    const replySetCookieHeader = ctx?.res?.getHeaders()["set-cookie"]
    if (!!replySetCookieHeader) {
      const csrfCookie = parse(replySetCookieHeader[0])
      const sessionCookie = parse(replySetCookieHeader[1])
      session = sessionCookie["session"]
      csrfToken = csrfCookie["csrfToken"]
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
