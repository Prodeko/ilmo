import LoadingOutlined from "@ant-design/icons/LoadingOutlined"
import { Spin } from "antd"

import { DummyPage } from "./Redirect"

interface LoadingProps {
  size?: "small" | "default" | "large" | "huge" | undefined
}

const spinSizes = {
  small: 18,
  medium: 24,
  large: 36,
  huge: 54,
}

const LoadingIcon = ({ size }: LoadingProps) => (
  <LoadingOutlined style={{ fontSize: spinSizes[size || "medium"] }} spin />
)

export const Loading = (props: LoadingProps) => (
  <Spin indicator={<LoadingIcon {...props} />} />
)

export const LoadingPadded = (props: LoadingProps) => (
  <div
    style={{
      padding: "2rem",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Loading {...props} />
  </div>
)

export const PageLoading: React.FC = () => {
  return (
    <DummyPage>
      <LoadingPadded size="large" />
    </DummyPage>
  )
}
