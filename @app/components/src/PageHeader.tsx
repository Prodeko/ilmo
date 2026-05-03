import { ReactNode } from "react"
import { ArrowLeftOutlined } from "@ant-design/icons"
import { Button, Typography } from "antd"

const { Title } = Typography

interface PageHeaderProps {
  title: ReactNode
  extra?: ReactNode
  onBack?: () => void
}

// Minimal stand-in for antd v4's PageHeader, which was removed in v5.
// Only the props the call sites actually use are supported.
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  extra,
  onBack,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 0",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {onBack ? (
        <Button
          aria-label="back"
          icon={<ArrowLeftOutlined />}
          size="small"
          type="text"
          onClick={onBack}
        />
      ) : null}
      <Title level={3} style={{ margin: 0 }}>
        {title}
      </Title>
    </div>
    {extra ? <div>{extra}</div> : null}
  </div>
)
