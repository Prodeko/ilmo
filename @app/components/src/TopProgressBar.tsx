import { notification } from "antd"
import * as NextRouter from "next/router"
import NProgress from "nprogress"

// Namespace-then-default access defeats Next 16 webpack's broken default-
// import bundling for next/router (see SharedLayout.tsx for context).
const Router = NextRouter.default

NProgress.configure({
  showSpinner: false,
})

if (typeof window !== "undefined") {
  Router.events.on("routeChangeStart", () => {
    NProgress.start()
  })
  Router.events.on("routeChangeComplete", () => {
    NProgress.done()
  })
  Router.events.on("routeChangeError", (err: Error | string) => {
    NProgress.done()
    if (err["cancelled"]) {
      // No worries; you deliberately cancelled it
    } else {
      notification.open({
        message: "Page load failed",
        description: `This is very embarrassing! Please reload the page. Further error details: ${
          typeof err === "string" ? err : err.message
        }`,
        duration: 0,
      })
    }
  })
}

export function TopProgressBar() {
  return null
}
