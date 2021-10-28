import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { extractError, getCodeFromError } from "@app/lib"
import { Alert } from "antd"

import { useTranslation } from "."

interface ErrorAlertProps {
  error: Error
  message?: string
  banner?: boolean
  setError?: React.Dispatch<React.SetStateAction<Error | null>>
  style?: React.CSSProperties
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  banner = false,
  error,
  message,
  setError,
  ...rest
}) => {
  const [mounted, setMounted] = useState(false)
  const { t } = useTranslation()
  const code = getCodeFromError(error)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const alertInner = (
    <Alert
      {...rest}
      banner={banner}
      closable={banner}
      description={
        <span
          style={{
            wordBreak: "break-word",
            border: "1px solib black",
            display: "block",
          }}
        >
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
  const alertContent = banner ? (
    <div
      style={{
        position: "fixed",
        top: "16px",
        left: "50%",
        width: "100%",
        maxWidth: "600px",
        transform: "translate(-50%, 0)",
        zIndex: 999,
      }}
    >
      {alertInner}
    </div>
  ) : (
    alertInner
  )
  const alertPortal = mounted
    ? createPortal(alertContent, document?.querySelector("#alert")!)
    : null

  return banner ? alertPortal : alertContent
}
