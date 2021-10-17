import { Result } from "antd"
import useTranslation from "next-translate/useTranslation"

import { ButtonLink } from "./ButtonLink"

export function FourOhFour() {
  const { t } = useTranslation("error")
  return (
    <div>
      <Result
        extra={
          <ButtonLink href="/" type="primary">
            {t("common:backHome")}
          </ButtonLink>
        }
        status="404"
        subTitle={t("404")}
        title="404"
      />
    </div>
  )
}
