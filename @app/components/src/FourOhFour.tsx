import { Result } from "antd"

import { ButtonLink } from "./ButtonLink"
import { useTranslation } from "."

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
