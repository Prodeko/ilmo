import { PaymentMode } from "@app/graphql"
import {
  formatEuro,
  guildReceivesCents,
  isValidTicketPriceCents,
  ticketPriceEurosToCents,
} from "@app/lib"
import { Alert, Form, InputNumber, Tooltip, Typography } from "antd"

import { useTranslation } from "../.."

const { Text } = Typography

interface QuotaPriceProps {
  name: number
  index: number
}

/**
 * Ticket price input and the live "Guild receives" estimate for one quota.
 * The price is edited in euros and stored as cents on submit.
 */
export const QuotaPriceField: React.FC<QuotaPriceProps> = ({ name, index }) => {
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
export const QuotaPriceWarning: React.FC<QuotaPriceWarningProps> = ({
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
