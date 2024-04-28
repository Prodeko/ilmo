import { Alert, Result } from "antd"
import { CombinedError } from "urql"

import { useTranslation } from "."

interface ErrorResultProps {
  error: CombinedError | Error
}

export function ErrorResult({ error }: ErrorResultProps) {
  const { t } = useTranslation("error")

  return (
    <Result
      status="error"
      subTitle={t("unknownError")}
      title={<>{t("ErrorResult.unexpectedError")}</>}
    >
      <Alert message={error.message} type="error" />
    </Result>
  )
}
