import { Dispatch, SetStateAction } from "react"
import {
  CreateEventPageQuery,
  PaymentMode,
  UpdateEventPageQuery,
} from "@app/graphql"
import { range, tailFormItemLayout } from "@app/lib"
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Typography,
} from "antd"
import dayjs from "dayjs"

import { Editor, ErrorAlert, FileUpload, useTranslation } from "../."

import { FormValues } from "."

import type { UploadFile } from "antd/lib/upload/interface"

const { Option } = Select
const { Group } = Input
const { RangePicker } = DatePicker
const { Text, Title } = Typography

const PAYMENT_MODES = [
  { value: PaymentMode.None, label: "modeNone", help: "modeNoneHelp" },
  {
    value: PaymentMode.DuringRegistration,
    label: "modeDuring",
    help: "modeDuringHelp",
  },
  {
    value: PaymentMode.AfterRegistration,
    label: "modeAfter",
    help: "modeAfterHelp",
  },
]

interface PaymentSettingsProps {
  savedPaymentMode: PaymentMode | null | undefined
  hasRegistrations: boolean
}

/**
 * The Payments section of the General tab (board 7). Only rendered when
 * payments are enabled for the site.
 */
const PaymentSettings: React.FC<PaymentSettingsProps> = ({
  savedPaymentMode,
  hasRegistrations,
}) => {
  const { t } = useTranslation("admin")
  const form = Form.useFormInstance()
  const paymentMode = Form.useWatch("paymentMode", form)
  const isAfterMode = paymentMode === PaymentMode.AfterRegistration

  return (
    <>
      <Form.Item {...tailFormItemLayout}>
        <Title level={5} style={{ marginBottom: 0 }}>
          {t("payments.settings.title")}
        </Title>
        <Text type="secondary">{t("payments.settings.subtitle")}</Text>
      </Form.Item>
      <Form.Item label={t("payments.settings.modeLabel")} name="paymentMode">
        <Radio.Group
          data-cy="eventform-radio-payment-mode"
          onChange={(e) => {
            // The close email is how participants get their payment link
            // in after mode, so it is always on there.
            if (e.target.value === PaymentMode.AfterRegistration) {
              form.setFieldValue("sendUnpaidEmailOnClose", true)
            }
          }}
        >
          <Space direction="vertical" style={{ width: "100%" }}>
            {PAYMENT_MODES.map(({ value, label, help }) => (
              <Radio
                key={value}
                data-cy={`eventform-radio-payment-mode-${value}`}
                // Bordered option cards (board 7)
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 6,
                  border: `1px solid ${
                    paymentMode === value ? "#002e7d" : "#e8edf3"
                  }`,
                  background: paymentMode === value ? "#e8f0fc" : "#ffffff",
                }}
                value={value}
              >
                <Text strong>{t(`payments.settings.${label}`)}</Text>
                <br />
                <Text type="secondary">{t(`payments.settings.${help}`)}</Text>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </Form.Item>
      {savedPaymentMode &&
        savedPaymentMode !== PaymentMode.None &&
        paymentMode === PaymentMode.None && (
          <Form.Item {...tailFormItemLayout}>
            <Alert
              message={t("payments.settings.switchToNoneWarning")}
              type="warning"
              showIcon
            />
          </Form.Item>
        )}
      {savedPaymentMode === PaymentMode.None &&
        hasRegistrations &&
        !!paymentMode &&
        paymentMode !== PaymentMode.None && (
          <Form.Item {...tailFormItemLayout}>
            <Alert
              data-cy="eventform-alert-switch-to-paid"
              message={t("payments.settings.switchToPaidWarning")}
              type="warning"
              showIcon
            />
          </Form.Item>
        )}
      <Form.Item
        {...tailFormItemLayout}
        hidden={!paymentMode || paymentMode === PaymentMode.None}
        name="sendUnpaidEmailOnClose"
        valuePropName="checked"
      >
        <Checkbox
          data-cy="eventform-checkbox-send-unpaid-email-on-close"
          disabled={isAfterMode}
        >
          <Text strong>{t("payments.settings.emailOnClose")}</Text>
          <br />
          <Text type="secondary">
            {isAfterMode
              ? t("payments.settings.emailOnCloseLockedHelp")
              : t("payments.settings.emailOnCloseHelp")}
          </Text>
        </Checkbox>
      </Form.Item>
    </>
  )
}

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
      {data?.paymentsEnabled && (
        <PaymentSettings
          hasRegistrations={
            type === "update" &&
            !!(data as UpdateEventPageQuery)?.event?.quotas?.nodes?.some(
              (q) => (q?.registrations?.totalCount ?? 0) > 0
            )
          }
          savedPaymentMode={
            type === "update"
              ? (data as UpdateEventPageQuery)?.event?.paymentMode
              : undefined
          }
        />
      )}
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
