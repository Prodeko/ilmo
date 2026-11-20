import { useRef, useState } from "react"
import { css } from "@emotion/css"
import { DatePicker, Input, InputRef, Space } from "antd"
import { Dayjs } from "dayjs"

import type { RangePickerProps } from "antd/es/date-picker"

const { RangePicker } = DatePicker

const timeUnits = ["hour", "minute", "second"] as const
// Hide the time scroll columns and put the time boxes on the OK button's row
const timePopup = css`
  .ant-picker-time-panel {
    display: none;
  }
  && .ant-picker-footer {
    display: flex;
    align-items: center;
  }
  && .ant-picker-footer-extra {
    flex: 1;
    border-bottom: none;
  }
`

// RangePicker whose time is typed into HH : mm : ss boxes below the calendar
// instead of picked from scroll columns
export const TimeRangePicker: React.FC<RangePickerProps> = ({
  value,
  onChange,
  ...props
}) => {
  const [active, setActive] = useState(0)
  // Dates picked in the open popup before OK is pressed
  const [pending, setPending] = useState<RangePickerProps["value"]>(null)
  // Digits typed so far in the focused box, shown unpadded while typing
  const [draft, setDraft] = useState<{ box: number; text: string } | null>(null)
  const boxes = useRef<Array<InputRef | null>>([])
  const current = pending ?? value
  const date = current?.[active]

  function typeDigits(i: number, input: string) {
    if (!date) return
    const unit = timeUnits[i]
    const text = input.replace(/\D/g, "").slice(0, 2)
    setDraft({ box: i, text })
    if (!text) return

    const max = unit === "hour" ? 23 : 59
    const next = [...(current ?? [null, null])] as [Dayjs | null, Dayjs | null]
    next[active] = date[unit](Math.min(Number(text), max))
    setPending(next)
    onChange?.(next, ["", ""])

    // Two digits fill the box: continue with the next one
    if (text.length === 2 && i < timeUnits.length - 1) focusBox(i + 1)
  }

  // Deferred so the boxes are enabled before they get focus
  function focusBox(i: number) {
    setTimeout(() => boxes.current[i]?.focus())
  }

  return (
    <RangePicker
      {...props}
      classNames={{ popup: { root: timePopup } }}
      order={false}
      renderExtraFooter={() => (
        <Space size={4}>
          {timeUnits.map((unit, i) => (
            <Input
              key={unit}
              ref={(el) => {
                boxes.current[i] = el
              }}
              data-cy={`eventform-input-time-${unit}`}
              disabled={!date}
              inputMode="numeric"
              maxLength={2}
              size="small"
              style={{ width: 40, textAlign: "center" }}
              value={
                draft?.box === i
                  ? draft.text
                  : date
                    ? String(date[unit]()).padStart(2, "0")
                    : ""
              }
              onBlur={() => setDraft(null)}
              onChange={(e) => typeDigits(i, e.target.value)}
              onFocus={(e) => {
                setDraft(null)
                e.target.select()
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" && i < timeUnits.length - 1) {
                  e.preventDefault()
                  focusBox(i + 1)
                } else if (e.key === "ArrowLeft" && i > 0) {
                  e.preventDefault()
                  focusBox(i - 1)
                }
              }}
            />
          ))}
        </Space>
      )}
      value={value}
      onCalendarChange={(dates, _, info) => {
        const changed = info.range === "end" ? 1 : 0
        let next = dates
        // A start moved past the end clears the end (order={false} keeps
        // the picker from swapping them instead)
        if (changed === 0 && dates?.[0] && dates[1]?.isBefore(dates[0])) {
          next = [dates[0], null]
          onChange?.(next, ["", ""])
        }
        setPending(next)
        // A date was picked: continue with its hours
        if (next?.[changed]) focusBox(0)
      }}
      onChange={onChange}
      onFocus={(_, info) => setActive(info.range === "end" ? 1 : 0)}
      onOpenChange={(open) => !open && setPending(null)}
    />
  )
}
