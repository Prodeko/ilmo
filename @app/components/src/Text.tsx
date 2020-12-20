import React from "react";
import { Typography } from "antd";

// Extract the type of a function's first argument
// Usage: `Arg1<typeof functionHere>`
type Arg1<T> = T extends (arg: infer U) => any ? U : never;

type TitleProps = Arg1<typeof Typography.Title>;

export const H1: React.FC<TitleProps> = (props) => (
  <Typography.Title level={1} {...props} />
);
export const H2: React.FC<TitleProps> = (props) => (
  <Typography.Title level={2} {...props} />
);
export const H3: React.FC<TitleProps> = (props) => (
  <Typography.Title level={3} {...props} />
);
export const H4: React.FC<TitleProps> = (props) => (
  <Typography.Title level={4} {...props} />
);

const Paragraph: typeof Typography.Paragraph = Typography.Paragraph;
export { Paragraph as P };

type TextProps = Arg1<typeof Typography.Text>;
export const Strong: React.FC<TextProps> = (props) => (
  <Typography.Text strong {...props} />
);
