import { Button, ButtonProps } from "antd"
import Link, { LinkProps } from "next/link"

export const ButtonLink: React.FC<ButtonProps & LinkProps> = (props) => {
  const { href, as, locale, ...rest } = props
  return (
    <Link as={as} href={href} locale={locale} passHref>
      {/* Span absorbs Next.js Link's setRef so it doesn't loop with antd v5
          Button's forwardRef + internal effects. */}
      <span>
        <Button role="link" {...rest} />
      </span>
    </Link>
  )
}
