import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import DragOutlined from "@ant-design/icons/DragOutlined"
import MinusCircleTwoTone from "@ant-design/icons/MinusCircleTwoTone"
import PlusOutlined from "@ant-design/icons/PlusOutlined"
import { Button, Form, Input, InputNumber, Space, Tooltip } from "antd"
import useTranslation from "next-translate/useTranslation"

import { DisableDraggable, Draggable } from "../Draggable"

interface QuotasTabProps {
  initialValues?: any
  selectedLanguages: string[]
}

export const QuotasTab: React.FC<QuotasTabProps> = (props) => {
  const { initialValues, selectedLanguages } = props
  const { t } = useTranslation("events")

  return (
    <DndProvider backend={HTML5Backend}>
      <Form.List
        name="quotas"
        rules={[
          {
            validator: async (_, quotas) => {
              if (!quotas || quotas.length < 1) {
                return Promise.reject(
                  new Error(t("errors.mustProvideEventQuota"))
                )
              }
            },
          },
        ]}
      >
        {(fields, { add, remove, move }) => (
          <>
            {fields.map((field, index) => {
              const { name, fieldKey } = field
              const { registrations } = initialValues?.quotas?.[fieldKey] || {}
              const numRegistrations = registrations?.totalCount || 0
              return (
                <Draggable
                  {...field}
                  key={fieldKey}
                  id={fieldKey}
                  index={index}
                  move={move}
                >
                  {/*
                      These hidden form fields are needed so that the update
                      variant of this form works correctly
                  */}
                  <Form.Item
                    fieldKey={[fieldKey, "id"]}
                    name={[name, "id"]}
                    required={false}
                    noStyle
                  >
                    <Input type="hidden" />
                  </Form.Item>
                  <Form.Item
                    fieldKey={[fieldKey, "position"]}
                    name={[name, "position"]}
                    required={true}
                    noStyle
                  >
                    <Input type="hidden" />
                  </Form.Item>
                  <Space
                    align="baseline"
                    style={{ display: "flex", marginBottom: 8 }}
                  >
                    <DragOutlined />
                    {selectedLanguages.map((l) => (
                      <Form.Item
                        key={`${name}-${l}`}
                        fieldKey={[fieldKey, "title", l!]}
                        name={[name, "title", l!]}
                        rules={[
                          {
                            required: true,
                            message: t("forms.rules.quota.provideQuotaTitle"),
                          },
                        ]}
                        noStyle
                      >
                        <Input
                          data-cy={`eventform-input-quotas-title-${l}-${index}`}
                          placeholder={`${t(
                            "forms.placeholders.quota.title"
                          )} ${t(`common:lang.in.${l}`)}`}
                          {...DisableDraggable}
                        />
                      </Form.Item>
                    ))}
                    <Form.Item
                      fieldKey={[fieldKey, "size"]}
                      name={[name, "size"]}
                      rules={[
                        {
                          required: true,
                          message: t("forms.rules.quota.provideQuotaSize"),
                        },
                      ]}
                      noStyle
                    >
                      <InputNumber
                        {...DisableDraggable}
                        data-cy={`eventform-input-quotas-size-${index}`}
                        min={1}
                        placeholder={t("forms.placeholders.quota.size")}
                      />
                    </Form.Item>
                    {numRegistrations === 0 ? (
                      <Tooltip title={t("removeQuota")}>
                        <MinusCircleTwoTone
                          data-cy="eventform-quotas-remove-quota"
                          {...DisableDraggable}
                          twoToneColor="red"
                          onClick={() => remove(name)}
                        />
                      </Tooltip>
                    ) : (
                      <div>
                        {t("numRegistrations")}: {numRegistrations}
                      </div>
                    )}
                  </Space>
                </Draggable>
              )
            })}
            <Form.Item>
              <Button
                data-cy="eventform-quotas-add-quota"
                icon={<PlusOutlined />}
                type="dashed"
                block
                onClick={() => add()}
              >
                {t("addQuota")}
              </Button>
            </Form.Item>
          </>
        )}
      </Form.List>
    </DndProvider>
  )
}