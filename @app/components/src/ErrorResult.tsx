import SyncOutlined from "@ant-design/icons/SyncOutlined"
import { Alert, Button, Result } from "antd"
import Paragraph from "antd/lib/typography/Paragraph"
import useTranslation from "next-translate/useTranslation"
import { CombinedError } from "urql"

export interface ErrorResultProps {
  error: CombinedError | Error
}

export function ErrorResult({ error }: ErrorResultProps) {
  const { t } = useTranslation("error")
  const message: string | undefined = (error as any)?.graphQLErrors?.[0]
    ?.message
  if (message?.includes("CSRF")) {
    return (
      <Result
        status="403"
        subTitle={
          <>
            <Paragraph type="secondary">{t("csrfError")}</Paragraph>
            <Paragraph>
              <Button
                icon={<SyncOutlined />}
                type="primary"
                onClick={() => window.location.reload()}
              >
                {t("refresh")}
              </Button>
            </Paragraph>
          </>
        }
        title="Invalid CSRF token"
      />
    )
  }
  return (
    <Result
      status="error"
      subTitle={
        <span dangerouslySetInnerHTML={{ __html: t("unknownError") }} />
      }
      title="Unexpected error occurred"
    >
      <Alert message={error.message} type="error" />
    </Result>
  )
}
