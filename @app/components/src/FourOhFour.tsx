import { User } from "@app/graphql"
import { Result } from "antd"
import useTranslation from "next-translate/useTranslation"

import { ButtonLink } from "./ButtonLink"

interface FourOhFourProps {
  currentUser?: Pick<User, "id"> | null
}

export function FourOhFour(props: FourOhFourProps) {
  const { currentUser } = props
  const { t } = useTranslation("error")
  const subtitle = `${t("404.errorPart1")} ${
    currentUser ? "" : t("404.errorPart2")
  }`
  return (
    <div>
      <Result
        extra={
          <ButtonLink href="/" type="primary">
            {t("common:backHome")}
          </ButtonLink>
        }
        status="404"
        subTitle={<>{subtitle}</>}
        title="404"
      />
    </div>
  )
}
