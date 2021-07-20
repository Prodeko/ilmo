import { Button } from "antd"

import { ProdekoIcon } from "./ProdekoIcon"

export interface SocialLoginOptionsProps {
  next: string
  buttonTextFromService?: (service: string) => string
}

function defaultButtonTextFromService(service: string) {
  return `Sign in with ${service}`
}

export function SocialLoginOptions({
  next,
  buttonTextFromService = defaultButtonTextFromService,
}: SocialLoginOptionsProps) {
  return (
    <Button
      href={`/auth/oauth2?next=${encodeURIComponent(next)}`}
      icon={<ProdekoIcon size="20px" style={{ verticalAlign: "middle" }} />}
      size="large"
      type="primary"
      block
    >
      {buttonTextFromService("Prodeko")}
    </Button>
  )
}
