import { Dispatch, SetStateAction, useRef, useState } from "react"
import { CreateEventPageQuery, UpdateEventPageQuery } from "@app/graphql"
import { range } from "@app/lib"
import { css } from "@emotion/css"
import { DatePicker, Form, Input, InputRef, Select, Space, Switch } from "antd"
import dayjs, { Dayjs } from "dayjs"

import { Editor, FileUpload, useTranslation } from "../."

import { FormValues } from "."

import type { RangePickerProps } from "antd/es/date-picker"
import type { UploadFile } from "antd/lib/upload/interface"

const { Option } = Select
const { Group } = Input
const { RangePicker } = DatePicker

// Typing a time can store a half-filled range, so require both ends
const bothEndsSet = (_: unknown, value?: Array<Dayjs | null>) =>
  value?.[0] && value?.[1] ? Promise.resolve() : Promise.reject()

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
const TimeRangePicker: React.FC<RangePickerProps> = ({
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

interface MainTabProps {
  type: "update" | "create"
  formValues: FormValues
  data: CreateEventPageQuery | UpdateEventPageQuery
  selectedLanguages: string[]
  setSelectedLanguages: Dispatch<SetStateAction<string[]>>
  supportedLanguages: Array<string | null | undefined> | null | undefined
}

export const MainTab: React.FC<MainTabProps> = (props) => {
  const {
    type,
    data,
    formValues,
    selectedLanguages,
    setSelectedLanguages,
    supportedLanguages,
  } = props
  const { t, lang } = useTranslation("events")

  function getUploadDefaultFileList(): Array<UploadFile> | undefined {
    if (type === "update") {
      const { headerImageFile } = (data as UpdateEventPageQuery)?.event || {}
      const name = headerImageFile?.split("/")?.pop() ?? ""
      const uploadFile = {
        uid: "-1",
        name,
        status: "done",
        url: headerImageFile,
      } as UploadFile
      return [uploadFile]
    }
  }

  function _disabledDate(current: dayjs.Dayjs) {
    const eventStartTime = formValues?.eventTime?.[0]
    return eventStartTime
      ? current.isAfter(eventStartTime.add(1, "day"))
      : false
  }

  function _disabledDateTime(current: dayjs.Dayjs) {
    const { eventTime } = formValues || []
    const [eventStartTime, eventEndTime] = eventTime!

    // Don't restrict values if no eventStartTime is set yet
    // or if start and end times are the same. The times can be
    // the same due to some unknown bug in RangePicker (or somewhere)
    // else.
    if (!eventStartTime || eventStartTime === eventEndTime) return {}

    // Don't restrict values if currently selected date is before eventStartDate
    if (!current || current?.isBefore(eventStartTime)) return {}

    const eventStartHour = eventStartTime.get("hours")
    const eventStartMinute = eventStartTime.get("minutes")
    const eventStartSecond = eventStartTime.get("seconds")
    return {
      disabledHours: () => range(eventStartHour + 1, 24),
      disabledMinutes: () => range(eventStartMinute + 1, 60),
      disabledSeconds: () => range(eventStartSecond, 60),
    }
  }

  return (
    <>
      <Form.Item
        label={t("languages")}
        name="languages"
        rules={[
          {
            required: true,
            message: t("forms.rules.provideLanguage"),
            type: "array",
          },
        ]}
      >
        <Select
          data-cy="eventform-select-language"
          mode="multiple"
          placeholder={t("forms.placeholders.languages")}
          allowClear
          onChange={(e) => setSelectedLanguages(e as string[])}
        >
          {supportedLanguages?.map((l, i) => (
            <Option
              key={i}
              data-cy={`eventform-select-language-option-${l}`}
              value={l!}
            >
              {t(`common:lang.${l!.toLowerCase()}`)}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item
        label={t("organizer")}
        name="ownerOrganizationId"
        rules={[
          {
            required: true,
            message: t("forms.rules.event.provideOrganizer"),
          },
        ]}
      >
        <Select
          data-cy="eventform-select-organization-id"
          placeholder={t("forms.placeholders.event.organizer")}
        >
          {/*
            Every organization is offered. The event forms are admin-only, and
            `manage_admin` on app_public.events already lets an admin own an
            event for any organization; listing only their memberships left the
            dropdown empty for admins who hold none.
          */}
          {data?.organizations?.nodes?.map((o, i) => (
            <Option
              key={o.id}
              data-cy={`eventform-select-organization-id-option-${i}`}
              value={o.id}
            >
              {o.name}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item
        label={t("category")}
        name="categoryId"
        rules={[
          {
            required: true,
            message: t("forms.rules.event.provideCategory"),
          },
        ]}
      >
        <Select
          data-cy="eventform-select-category-id"
          placeholder={t("forms.placeholders.event.category")}
        >
          {data?.eventCategories?.nodes?.map((a, i) => (
            <Option
              key={a.id}
              data-cy={`eventform-select-category-id-option-${i}`}
              value={a.id}
            >
              {a.name[lang]}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item label={t("common:name")} required>
        <Group compact>
          {selectedLanguages.length === 0 ? (
            <Form.Item noStyle>
              <Input disabled />
            </Form.Item>
          ) : (
            selectedLanguages.map((l, i) => (
              <Form.Item
                key={l}
                name={["name", l.toLowerCase()]}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.event.provideName"),
                  },
                ]}
                noStyle
              >
                <Input
                  data-cy={`eventform-input-name-${l}`}
                  placeholder={t(`common:lang.in.${l}`)}
                  style={i > 0 ? { marginTop: 5 } : undefined}
                />
              </Form.Item>
            ))
          )}
        </Group>
      </Form.Item>
      <Form.Item label={t("common:description")} name="description" required>
        <Editor selectedLanguages={selectedLanguages} />
      </Form.Item>
      <Form.Item
        label={t("common:location")}
        name="location"
        rules={[
          {
            required: true,
            message: t("forms.rules.event.provideLocation"),
          },
        ]}
      >
        <Input
          data-cy="eventform-input-location"
          placeholder={t("common:location")}
        />
      </Form.Item>
      <Form.Item
        label={t("forms.eventTime")}
        name="eventTime"
        rules={[
          {
            required: true,
            message: t("forms.rules.event.provideEventTime"),
            validator: bothEndsSet,
          },
        ]}
      >
        <TimeRangePicker
          data-cy="eventform-input-event-time"
          format="YYYY-MM-DD HH:mm:ss"
          showTime
        />
      </Form.Item>
      <Form.Item
        label={t("forms.registrationTime")}
        name="registrationTime"
        rules={[
          {
            required: true,
            message: t("forms.rules.event.provideRegistrationTime"),
            validator: bothEndsSet,
          },
        ]}
      >
        <TimeRangePicker
          data-cy="eventform-input-registration-time"
          format="YYYY-MM-DD HH:mm:ss"
          showTime={{
            hideDisabledOptions: true,
            defaultOpenValue: [
              dayjs().hour(12).minute(0).second(0),
              dayjs().hour(23).minute(59).second(59),
            ],
          }}
        />
      </Form.Item>
      <Form.Item
        label={t("forms.highlightEvent")}
        name="isHighlighted"
        valuePropName="checked"
      >
        <Switch data-cy="eventform-switch-highlight" />
      </Form.Item>
      <Form.Item
        getValueFromEvent={(e) => e[0]}
        label={t("headerImage")}
        name="headerImageFile"
        valuePropName="headerImageFile"
      >
        <FileUpload
          accept="image/*"
          cropAspect={851 / 315}
          data-cy="eventform-header-image-upload"
          defaultFileList={getUploadDefaultFileList()}
          maxCount={1}
        />
      </Form.Item>
    </>
  )
}
