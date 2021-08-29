import { Dispatch, SetStateAction } from "react"
import { CreateEventPageQuery, Maybe, UpdateEventPageQuery } from "@app/graphql"
import { tailFormItemLayout } from "@app/lib"
import { Button, DatePicker, Form, Input, Row, Select, Switch } from "antd"
import { UploadFile } from "antd/lib/upload/interface"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { ErrorAlert, FileUpload } from "../index"

import { FormValues } from "."

const { Option } = Select
const { TextArea, Group } = Input
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
  supportedLanguages: Maybe<Maybe<string>[]>
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
      const { headerImageFile } = (data as UpdateEventPageQuery).event || {}
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

  function disabledDate(current: dayjs.Dayjs) {
    const { eventStartTime } = formValues
    return current.isAfter(dayjs(eventStartTime))
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
              value={l ? l : ""}
            >
              {t(`common:lang.${l}`)}
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
      <Form.Item label={t("common:name")}>
        <Group compact>
          {selectedLanguages.length === 0 ? (
            <Form.Item noStyle>
              <Input disabled />
            </Form.Item>
          ) : (
            selectedLanguages.map((l, i) => (
              <Form.Item
                key={l}
                name={["name", l!]}
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
      <Form.Item label={t("common:description")}>
        <Group compact>
          {selectedLanguages.length === 0 ? (
            <Form.Item noStyle>
              <TextArea disabled />
            </Form.Item>
          ) : (
            selectedLanguages.map((l, i) => (
              <Form.Item
                key={l}
                name={["description", l!]}
                rules={[
                  {
                    required: true,
                    message: t("forms.rules.event.provideDescription"),
                  },
                ]}
                noStyle
              >
                <TextArea
                  data-cy={`eventform-input-description-${l}`}
                  placeholder={t(`common:lang.in.${l}`)}
                  style={i > 0 ? { marginTop: 5 } : undefined}
                />
              </Form.Item>
            ))
          )}
        </Group>
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
          // @ts-ignore: dayjs is supported, types are incorrectly specified in antd
          disabledDate={disabledDate}
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
