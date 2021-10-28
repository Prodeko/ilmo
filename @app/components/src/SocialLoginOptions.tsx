import { useCallback } from "react"
import { Button } from "antd"

import { ProdekoIcon } from "./ProdekoIcon"
import { useTranslation } from "."

interface SocialLoginOptionsProps {
  next: string
  buttonTextFromService?: (service: string) => string
}

export function SocialLoginOptions({
  next,
  buttonTextFromService,
}: SocialLoginOptionsProps) {
  const { t } = useTranslation()

  const defaultButtonTextFromService = useCallback(
    (service: string) => `${t("common:signinWith")} ${service}`,
    [t]
  )
  return (
    <Button
      href={`/auth/oauth2?next=${encodeURIComponent(next)}`}
      icon={<ProdekoIcon size="20px" style={{ verticalAlign: "middle" }} />}
      size="large"
      type="primary"
      block
    >
      {buttonTextFromService
        ? buttonTextFromService("Prodeko")
        : defaultButtonTextFromService("Prodeko")}
    </Button>
  )
}
