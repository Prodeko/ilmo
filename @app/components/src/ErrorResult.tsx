import SyncOutlined from "@ant-design/icons/SyncOutlined"
import { Alert, Button, Result } from "antd"
import Paragraph from "antd/lib/typography/Paragraph"
import { CombinedError } from "urql"

export interface ErrorResultProps {
  error: CombinedError | Error
}

export function ErrorResult({ error }: ErrorResultProps) {
  const message: string | undefined = (error as any)?.graphQLErrors?.[0]
    ?.message
  if (message?.includes("CSRF")) {
    return (
      <Result
        status="403"
        subTitle={
          <>
            <Paragraph type="secondary">
              Our security protections have failed to authenticate your request;
              to solve this you need to refresh the page:
            </Paragraph>
            <Paragraph>
              <Button
                icon={<SyncOutlined />}
                type="primary"
                onClick={() => window.location.reload()}
              >
                Refresh page
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
        <span>
          We're really sorry, but an unexpected error occurred. Please{" "}
          <a href="/">return to the homepage</a> and try again.
        </span>
      }
      title="Unexpected error occurred"
    >
      <Alert message={error.message} type="error" />
    </Result>
  )
}
