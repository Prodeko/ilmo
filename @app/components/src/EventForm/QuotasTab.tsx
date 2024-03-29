import { memo, useEffect, useState } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import {
  DragOutlined,
  MinusCircleTwoTone,
  PlusOutlined,
} from "@ant-design/icons"
import { arePropsEqual } from "@app/lib"
import { Button, Form, Input, InputNumber, Space, Switch, Tooltip } from "antd"

import { useTranslation } from "../."
import { Draggable } from "../Draggable"

interface QuotasTabProps {
  initialValues?: any
  selectedLanguages: string[]
}

export const QuotasTab: React.FC<QuotasTabProps> = memo(
  ({ initialValues, selectedLanguages }) => {
    const [hasOpenQuota, setHasOpenQuota] = useState(false)
    const { t } = useTranslation("events")

    useEffect(() => {
      if (initialValues?.openQuotaSize > 0) setHasOpenQuota(true)
    }, [initialValues])

    return (
      <DndProvider backend={HTML5Backend}>
        <Form.List
          name="quotas"
          rules={[
            {
              validator: async (_, quotas) => {
                if ((!quotas || quotas?.length < 1) && !hasOpenQuota) {
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
                const { key, name } = field
                const { registrations } = initialValues?.quotas?.[key] || {}
                const numRegistrations = registrations?.totalCount || 0
                return (
                  <Draggable
                    {...field}
                    key={key}
                    id={key}
                    index={index}
                    move={move}
                  >
                    {/* These hidden form fields are needed so that the update
                      variant of the EventForm works correctly */}
                    <Form.Item name={[name, "id"]} required={false} noStyle>
                      <Input type="hidden" />
                    </Form.Item>
                    <Form.Item name={[name, "position"]} noStyle required>
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
                          name={[name, "title", l.toLowerCase()]}
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
                          />
                        </Form.Item>
                      ))}
                      <Form.Item
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
                          data-cy={`eventform-input-quotas-size-${index}`}
                          min={1}
                          placeholder={t("forms.placeholders.quota.size")}
                        />
                      </Form.Item>
                      {numRegistrations === 0 ? (
                        <Tooltip title={t("removeQuota")}>
                          <MinusCircleTwoTone
                            data-cy="eventform-quotas-remove-quota"
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
        <Space>
          <span>{t("addOpenQuota")}: </span>
          <Switch
            checked={hasOpenQuota}
            data-cy="eventform-quotas-switch-is-open-quota"
            onChange={(val) => setHasOpenQuota(val)}
          />
          <Form.Item
            name="openQuotaSize"
            rules={[
              {
                required: hasOpenQuota,
                message: t("forms.rules.quota.provideQuotaSize"),
              },
            ]}
            noStyle
          >
            <InputNumber
              data-cy="eventform-input-quotas-openquota-size"
              disabled={!hasOpenQuota}
              min={0}
              placeholder={t("forms.placeholders.quota.size")}
            />
          </Form.Item>
        </Space>
      </DndProvider>
    )
  },
  arePropsEqual
)
