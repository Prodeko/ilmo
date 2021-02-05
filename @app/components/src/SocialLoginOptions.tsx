import React from "react";

import { ButtonLink } from "./ButtonLink";
import { ProdekoIcon } from "./ProdekoIcon";

export interface SocialLoginOptionsProps {
  next: string;
  buttonTextFromService?: (service: string) => string;
}

function defaultButtonTextFromService(service: string) {
  return `Sign in with ${service}`;
}

export function SocialLoginOptions({
  next,
  buttonTextFromService = defaultButtonTextFromService,
}: SocialLoginOptionsProps) {
  return (
    <ButtonLink
      block
      size="large"
      icon={<ProdekoIcon style={{ verticalAlign: "middle" }} size="20px" />}
      href={`/auth/oauth2?next=${encodeURIComponent(next)}`}
      type="primary"
      locale={false}
    >
      {buttonTextFromService("Prodeko")}
    </ButtonLink>
  );
}
