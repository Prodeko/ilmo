import React, { useEffect } from "react"
import { useApolloClient } from "@apollo/client"
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
  const client = useApolloClient()
  const { t } = useTranslation("common")

  return (
    <SharedLayout
      query={{
        loading: true,
        data: undefined,
        error: undefined,
        networkStatus: 0,
        client,
        refetch: (async () => {
          throw new Error(t("redirect"))
        }) as any,
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
