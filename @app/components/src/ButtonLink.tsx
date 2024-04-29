import Button, { ButtonProps } from "antd-button-color"
import Link, { LinkProps } from "next/link"

export const ButtonLink: React.FC<ButtonProps & LinkProps> = (props) => {
  const { href, as, locale, ...rest } = props
  return (
    <Link as={as} href={href} locale={locale} legacyBehavior passHref>
      <Button role="link" {...rest} />
    </Link>
  )
}
