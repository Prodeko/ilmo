import { memo, useEffect, useState } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import {
  DragOutlined,
  MinusCircleTwoTone,
  PlusOutlined,
} from "@ant-design/icons"
import { PaymentMode } from "@app/graphql"
import {
  arePropsEqual,
  formatEuro,
  guildReceivesCents,
  isValidTicketPriceCents,
  ticketPriceEurosToCents,
} from "@app/lib"
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  Tooltip,
  Typography,
} from "antd"

import { useTranslation } from "../."
import { Draggable } from "../Draggable"

const { Text } = Typography

interface QuotasTabProps {
  initialValues?: any
  selectedLanguages: string[]
  paymentsEnabled?: boolean
}

interface QuotaPriceProps {
  name: number
  index: number
}

/**
 * Ticket price input and the live "Guild receives" estimate for one quota
 * (board 8). The price is edited in euros and stored as cents on submit.
 */
const QuotaPrice: React.FC<QuotaPriceProps> = ({ name, index }) => {
  const { t } = useTranslation("admin")

  return (
    <>
      <Form.Item
        name={[name, "price"]}
        rules={[
          {
            validator: async (_, value) => {
              const cents = ticketPriceEurosToCents(value)
              if (!isValidTicketPriceCents(cents)) {
                throw new Error(t("payments.quotas.invalidPrice"))
              }
            },
          },
        ]}
        noStyle
      >
        <InputNumber
          addonAfter="€"
          aria-label={t("payments.quotas.ticketPrice")}
          data-cy={`eventform-input-quotas-price-${index}`}
          decimalSeparator=","
          min={0}
          placeholder={t("payments.quotas.ticketPrice")}
          precision={2}
          step={1}
          style={{ width: 150 }}
        />
      </Form.Item>
      <Form.Item
        shouldUpdate={(prev, cur) =>
          prev.quotas?.[name]?.price !== cur.quotas?.[name]?.price
        }
        noStyle
      >
        {({ getFieldValue }) => {
          const cents = ticketPriceEurosToCents(
            getFieldValue(["quotas", name, "price"])
          )
          const isPaid = isValidTicketPriceCents(cents) && cents > 0
          const label = !isValidTicketPriceCents(cents)
            ? "–"
            : cents === 0
              ? t("payments.quotas.free")
              : `≈ ${formatEuro(guildReceivesCents(cents))}`
          return (
            <Tooltip title={t("payments.quotas.guildReceives")}>
              <Text
                data-cy={`eventform-quotas-guild-receives-${index}`}
                strong={isPaid}
                style={{ whiteSpace: "nowrap" }}
                type={isPaid ? "success" : "secondary"}
              >
                {label}
              </Text>
            </Tooltip>
          )
        }}
      </Form.Item>
    </>
  )
}

interface QuotaPriceWarningProps {
  name: number
  initialValues?: any
}

/**
 * Registrations keep the price they registered at, so changing the price of a
 * quota that already has registrations only affects new ones.
 */
const QuotaPriceWarning: React.FC<QuotaPriceWarningProps> = ({
  name,
  initialValues,
}) => {
  const { t } = useTranslation("admin")

  return (
    <Form.Item
      shouldUpdate={(prev, cur) =>
        prev.quotas?.[name]?.price !== cur.quotas?.[name]?.price ||
        prev.quotas?.[name]?.id !== cur.quotas?.[name]?.id
      }
      noStyle
    >
      {({ getFieldValue }) => {
        const id = getFieldValue(["quotas", name, "id"])
        const initialQuota = id
          ? initialValues?.quotas?.find((q: any) => q?.id === id)
          : undefined
        const numRegistrations = initialQuota?.registrations?.totalCount || 0
        const savedCents = initialQuota?.priceCents ?? 0
        const cents = ticketPriceEurosToCents(
          getFieldValue(["quotas", name, "price"])
        )
        // Registrations of an event without payments have no price yet, so
        // there is nothing for them to keep.
        const savedModeIsPaid =
          !!initialValues?.paymentMode &&
          initialValues.paymentMode !== PaymentMode.None
        if (
          !savedModeIsPaid ||
          numRegistrations === 0 ||
          cents === savedCents
        ) {
          return null
        }
        return (
          <Alert
            data-cy="eventform-quotas-price-changed-warning"
            message={t("payments.quotas.priceChangedWarning", {
              count: numRegistrations,
              price: formatEuro(savedCents),
            })}
            style={{ marginBottom: 8, marginLeft: 22 }}
            type="warning"
          />
        )
      }}
    </Form.Item>
  )
}

export const QuotasTab: React.FC<QuotasTabProps> = memo(
  ({ initialValues, selectedLanguages, paymentsEnabled }) => {
    const [hasOpenQuota, setHasOpenQuota] = useState(false)
    const { t } = useTranslation("events")
    const form = Form.useFormInstance()
    const paymentMode = Form.useWatch("paymentMode", form)
    // Prices only mean something when the event collects payments
    const showPrices =
      !!paymentsEnabled && !!paymentMode && paymentMode !== PaymentMode.None

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
                      {showPrices && <QuotaPrice index={index} name={name} />}
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
                    {showPrices && (
                      <QuotaPriceWarning
                        initialValues={initialValues}
                        name={name}
                      />
                    )}
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
        {showPrices && (
          <Space
            direction="vertical"
            size={2}
            style={{ display: "flex", marginTop: 16 }}
          >
            <Text type="secondary">{t("admin:payments.quotas.noteFree")}</Text>
            <Text type="secondary">{t("admin:payments.quotas.noteFees")}</Text>
            <Text type="secondary">
              {t("admin:payments.quotas.noteOpenQuota")}
            </Text>
          </Space>
        )}
      </DndProvider>
    )
  },
  arePropsEqual
)
