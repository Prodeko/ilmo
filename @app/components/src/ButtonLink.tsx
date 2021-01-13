import React from "react";
import { Button } from "antd";
import { ButtonProps } from "antd/lib/button";
import Link from "next/link";

export function ButtonLink(props: ButtonProps & { href: string; as?: string }) {
  const { href, as, ...rest } = props;
  return (
    <Link href={href} as={as} passHref>
      <Button {...rest} />
    </Link>
  );
}
