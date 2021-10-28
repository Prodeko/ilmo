import { Col, Row } from "antd"

import { contentMaxWidth } from "./SharedLayout"

interface StandardWidthProps {
  children: React.ReactNode
  noPad?: boolean
}

export const StandardWidth: React.FC<StandardWidthProps> = ({
  children,
  noPad = false,
}) => (
  <Row
    style={{
      padding: noPad ? 0 : "1rem",
      maxWidth: contentMaxWidth,
      margin: "0 auto",
    }}
  >
    <Col flex={1}>{children}</Col>
  </Row>
)
