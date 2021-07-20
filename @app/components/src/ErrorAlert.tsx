import { extractError, getCodeFromError } from "@app/lib"
import { Alert } from "antd"
import useTranslation from "next-translate/useTranslation"

interface ErrorAlertProps {
  error: Error
  message?: string
  banner?: boolean
  setError?: React.Dispatch<React.SetStateAction<Error | null>>
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  banner = false,
  error,
  message,
  setError,
  ...rest
}) => {
  const { t } = useTranslation()
  const code = getCodeFromError(error)
  const alert = (
    <Alert
      {...rest}
      banner={banner}
      closable={banner}
      description={
        <span>
          {extractError(error).message}{" "}
          {code && (
            <span>
              ({t("error:errorCode")}: <code>ERR_{code}</code>)
            </span>
          )}
        </span>
      }
      message={message}
      type="error"
      onClose={() => setError?.(null)}
    />
  )

  return error ? (
    banner ? (
      <div
        style={{
          position: "fixed",
          top: "16px",
          left: "50%",
          transform: "translate(-50%, 0)",
          zIndex: 999,
        }}
      >
        {alert}
      </div>
    ) : (
      alert
    )
  ) : null
}
