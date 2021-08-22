import { useCallback } from "react"
import {
  Color,
  ColorPicker as ReactColorPalettePicker,
  useColor,
} from "react-color-palette"
import { Space, Tag } from "antd"

import { useIsMobile } from "./hooks"

interface ColorPickerProps {
  // These come from antd Form.Item, value is currently unused
  value?: string
  onChange?: (value: string) => void
  "data-cy"?: string
}

export const ColorPicker: React.FC<ColorPickerProps> = (props) => {
  const { value, onChange } = props
  const initialColor = "#002e7d"
  const [color, setColor] = useColor("hex", value ?? initialColor)
  const isMobile = useIsMobile()

  const handleChange = useCallback(
    (color: Color) => {
      if (onChange) {
        onChange(color.hex)
      }
      setColor(color)
    },
    [onChange, setColor]
  )

  return (
    <Space direction="vertical">
      <Tag color={color?.hex}>{color?.hex}</Tag>
      <ReactColorPalettePicker
        color={color}
        data-cy={props["data-cy"]}
        height={120}
        width={isMobile ? 250 : 320}
        hideHSB
        hideHSV
        hideRGB
        // @ts-ignore
        onChange={handleChange}
      />
    </Space>
  )
}
