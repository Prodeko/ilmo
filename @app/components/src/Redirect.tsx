import { useEffect } from "react"
import { Skeleton } from "antd"
import Router from "next/router"
import useTranslation from "next-translate/useTranslation"

import { H3, SharedLayout, StandardWidth } from "."

export interface RedirectProps {
  href: string
  as?: string
  layout?: boolean
}

export const DummyPage: React.FC = ({ children }) => {
  const { t } = useTranslation("common")

  return (
    <SharedLayout
      query={{
        fetching: true,
        data: undefined,
        error: undefined,
        stale: false,
      }}
      title={t("redirect")}
    >
      {children}
    </SharedLayout>
  )
}

export function Redirect({ href, as, layout }: RedirectProps) {
  const { t } = useTranslation("common")

  useEffect(() => {
    Router.push(href, as)
  }, [as, href])

  if (layout) {
    return (
      <DummyPage>
        <Skeleton />
      </DummyPage>
    )
  } else {
    return (
      <StandardWidth>
        <H3>{t("redirect")}</H3>
        <Skeleton />
      </StandardWidth>
    )
  }
}
