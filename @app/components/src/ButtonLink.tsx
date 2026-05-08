import { Button, ButtonProps } from "antd"
import Link, { LinkProps } from "next/link"

export const ButtonLink: React.FC<ButtonProps & LinkProps> = (props) => {
  const { href, as, locale, ...rest } = props
  // legacyBehavior + passHref so Link clones Button and passes href onto it.
  // Antd Button with `href` renders an `<a class="ant-btn">`, so the markup
  // is a single anchor styled as a button — valid HTML and still benefits
  // from Next's client-side routing.
  return (
    <Link as={as} href={href} locale={locale} legacyBehavior passHref>
      <Button role="link" {...rest} />
    </Link>
  )
}
