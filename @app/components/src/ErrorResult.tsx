import { useCallback } from "react"
import { SyncOutlined } from "@ant-design/icons"
import { removeCsrfCookie } from "@app/lib"
import { Alert, Button, Result } from "antd"
import { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"
import { CombinedError } from "urql"

import { useIlmoContext } from "."

export interface ErrorResultProps {
  error: CombinedError | Error
}

export function ErrorResult({ error }: ErrorResultProps) {
  const { t } = useTranslation("error")
  const { resetUrqlClient } = useIlmoContext()
  const router = useRouter()
  const message: string | undefined = (error as any)?.graphQLErrors?.[0]
    ?.message

  const handleCsrfRefresh = useCallback(() => {
    removeCsrfCookie()
    resetUrqlClient()
    router.reload()
  }, [resetUrqlClient, router])

  if (message?.includes("CSRF")) {
    return (
      <Result
        extra={
          <Button
            data-cy="error-csrf-refresh"
            icon={<SyncOutlined />}
            type="primary"
            onClick={handleCsrfRefresh}
          >
            {t("refresh")}
          </Button>
        }
        status="403"
        subTitle={t("csrfError")}
        title={t("ErrorResult.invalidCsrfToken")}
      />
    )
  }

  return (
    <Result
      status="error"
      subTitle={t("unknownError")}
      title={t("ErrorResult.unexpectedError")}
    >
      <Alert message={error.message} type="error" />
    </Result>
  )
}
