import { useEffect } from "react"
import { Skeleton } from "antd"
import { useRouter } from "next/router"

import { H3, SharedLayout, StandardWidth, useTranslation } from "."

interface RedirectProps {
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

export const Redirect: React.FC<RedirectProps> = ({ href, as, layout }) => {
  const router = useRouter()
  const { t } = useTranslation("common")

  useEffect(() => {
    router.push(href, as)
  }, [router, as, href])

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
