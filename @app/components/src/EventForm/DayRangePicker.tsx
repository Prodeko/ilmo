import { useRef, useState } from "react"
import { DatePicker } from "antd"
import dayjs from "dayjs"

import type { RangePickerProps } from "antd/es/date-picker"

const { RangePicker } = DatePicker

type Range = [dayjs.Dayjs | null, dayjs.Dayjs | null] | null

interface DayRangePickerProps {
  // value and onChange are passed in by Form.Item
  value?: Range
  onChange?: (value: Range) => void
  // Clicking a start day ends the range this many days later, at 23:59:59
  endAfterDays: number
  "data-cy"?: string
  showTime?: RangePickerProps["showTime"]
}

/**
 * A date and time range picker where clicking a new start day in the
 * calendar fills in the whole range at once: it starts at 12:00 that day
 * and ends at 23:59:59 `endAfterDays` later. Typing into the inputs or
 * clicking a time keeps working as usual, so exact times can still be set.
 */
export const DayRangePicker: React.FC<DayRangePickerProps> = ({
  value,
  onChange,
  endAfterDays,
  "data-cy": dataCy,
  showTime = true,
}) => {
  const [open, setOpen] = useState(false)
  // Typing and clicking both report changes the same way, so remember
  // whether the latest change started with a click inside the calendar
  const clickedInPanel = useRef(false)

  const handleCalendarChange: RangePickerProps["onCalendarChange"] = (
    dates,
    _,
    info
  ) => {
    const clicked = clickedInPanel.current
    clickedInPanel.current = false
    const day = dates?.[0]
    // Only a newly clicked start day fills in the defaults; clicking a time
    // on the same day must not reset it
    if (!clicked || info.range !== "start" || !day) return
    if (value?.[0] && day.isSame(value[0], "day")) return

    const start = day.hour(12).minute(0).second(0).millisecond(0)
    const end = day
      .add(endAfterDays, "day")
      .hour(23)
      .minute(59)
      .second(59)
      .millisecond(0)
    onChange?.([start, end])
    setOpen(false)
  }

  return (
    <RangePicker
      data-cy={dataCy}
      format="YYYY-MM-DD HH:mm:ss"
      open={open}
      panelRender={(panel) => (
        <div onMouseDown={() => (clickedInPanel.current = true)}>{panel}</div>
      )}
      showTime={showTime}
      value={value}
      onCalendarChange={handleCalendarChange}
      onChange={(range) => onChange?.(range)}
      onOpenChange={setOpen}
    />
  )
}
