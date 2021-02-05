import React from "react";
import { Button } from "antd";
import { ButtonProps } from "antd/lib/button";
import Link, { LinkProps } from "next/link";

export const ButtonLink: React.FC<ButtonProps & LinkProps> = (props) => {
  const { href, as, locale, ...rest } = props;
  return (
    <Link href={href} as={as} locale={locale} passHref>
      <Button {...rest} />
    </Link>
  );
};
