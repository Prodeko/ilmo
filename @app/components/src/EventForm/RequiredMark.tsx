import { theme } from "antd"

// The same red asterisk antd shows next to required fields
// (see antd's .ant-form-item-required::before)
export const RequiredMark: React.FC = () => {
  const { token } = theme.useToken()
  return (
    <span
      style={{
        display: "inline-block",
        marginInlineEnd: token.marginXXS,
        color: token.colorError,
        fontSize: token.fontSize,
        fontFamily: "SimSun, sans-serif",
        lineHeight: 1,
      }}
    >
      *
    </span>
  )
}
