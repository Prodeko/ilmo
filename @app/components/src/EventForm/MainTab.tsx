import { Dispatch, SetStateAction } from "react"
import { CreateEventPageQuery, UpdateEventPageQuery } from "@app/graphql"
import { range, tailFormItemLayout } from "@app/lib"
import { Button, DatePicker, Form, Input, Row, Select, Switch } from "antd"
import dayjs from "dayjs"

import { Editor, ErrorAlert, FileUpload, useTranslation } from "../."

import { FormValues } from "."

import type { UploadFile } from "antd/lib/upload/interface"

const { Option } = Select
const { Group } = Input
const { RangePicker } = DatePicker

interface MainTabProps {
  type: "update" | "create"
  formValues: FormValues
  data: CreateEventPageQuery | UpdateEventPageQuery
  formSubmitting: boolean
  selectedLanguages: string[]
  setSelectedLanguages: Dispatch<SetStateAction<string[]>>
  isDraft: boolean
  setIsDraft: Dispatch<SetStateAction<boolean>>
  tabErrors: string[] | null
  formError: any
  supportedLanguages: Array<string | null | undefined> | null | undefined
}

export const MainTab: React.FC<MainTabProps> = (props) => {
  const {
    type,
    data,
    formValues,
    selectedLanguages,
    setSelectedLanguages,
    isDraft,
    setIsDraft,
    formError,
    tabErrors,
    formSubmitting,
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
          {data?.currentUser?.organizationMemberships?.nodes?.map((o, i) => (
            <Option
              key={o.organization?.id}
              data-cy={`eventform-select-organization-id-option-${i}`}
              value={o.organization?.id}
            >
              {o.organization?.name}
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
            type: "array",
            required: true,
            message: t("forms.rules.event.provideEventTime"),
          },
        ]}
      >
        <RangePicker
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
            type: "array",
            required: true,
            message: t("forms.rules.event.provideRegistrationTime"),
          },
        ]}
      >
        <RangePicker
          data-cy="eventform-input-registration-time"
          format="YYYY-MM-DD HH:mm:ss"
          showTime={{
            hideDisabledOptions: true,
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
      <Form.Item
        label={t("forms.saveAsDraft")}
        name="isDraft"
        valuePropName="checked"
      >
        <Switch
          data-cy="eventform-switch-save-as-draft"
          defaultChecked={isDraft}
          onChange={(checked) => setIsDraft(checked)}
        />
      </Form.Item>
      {formError && (
        <Form.Item {...tailFormItemLayout}>
          <ErrorAlert
            error={formError}
            message={
              type === "create"
                ? t("errors.eventCreateFailed")
                : t("errors.eventUpdateFailed")
            }
          />
        </Form.Item>
      )}
      {tabErrors ? (
        <Form.Item label={t("errors.formTabErrors")}>
          {tabErrors?.map((e, i) => (
            <Row key={i}>
              <span style={{ color: "red" }}>{e}</span>
            </Row>
          ))}
        </Form.Item>
      ) : null}
      <Form.Item {...tailFormItemLayout}>
        <Button
          data-cy="eventform-button-submit"
          disabled={selectedLanguages.length === 0 ? true : false}
          htmlType="submit"
          loading={formSubmitting}
        >
          {t(`common:${type}`)}
        </Button>
      </Form.Item>
    </>
  )
}
