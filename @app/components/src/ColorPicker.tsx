import { useCallback } from "react"
import {
  ColorPicker as ReactColorPalettePicker,
  IColor,
  useColor,
} from "react-color-palette"
import { primaryColor } from "@app/lib"
import { Space, Tag } from "antd"

interface ColorPickerProps {
  // These come from antd Form.Item, value is currently unused
  value?: string
  onChange?: (value: string) => void
  "data-cy"?: string
}

export const ColorPicker: React.FC<ColorPickerProps> = (props) => {
  const { value, onChange } = props
  const initialColor = primaryColor
  const [color, setColor] = useColor(value ?? initialColor)

  const handleChange = useCallback(
    (color: IColor) => {
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
        hideInput={["hsv", "rgb"]}
        onChange={handleChange}
      />
    </Space>
  )
}
