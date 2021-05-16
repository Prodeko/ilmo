import React from "react"
import { User } from "@app/graphql"
import { Result } from "antd"
import useTranslation from "next-translate/useTranslation"

import { ButtonLink } from "./ButtonLink"

interface FourOhFourProps {
  currentUser?: Pick<User, "id"> | null
}

export function FourOhFour(props: FourOhFourProps) {
  const { currentUser } = props
  const { t } = useTranslation()
  return (
    <div data-cy="fourohfour-div">
      <Result
        extra={
          <ButtonLink href="/" type="primary">
            {t("common:backHome")}
          </ButtonLink>
        }
        status="404"
        subTitle={`The page you attempted to load was not found.${
          currentUser ? "" : " Maybe you need to log in?"
        }`}
        title="404"
      />
    </div>
  )
}
