import { PaymentMode } from "@app/graphql"
import { tailFormItemLayout } from "@app/lib"
import { Alert, Checkbox, Form, Radio, Space, Typography } from "antd"

import { useTranslation } from "../../."

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

interface PaymentSettingsFieldsProps {
  savedPaymentMode: PaymentMode | null | undefined
  hasRegistrations: boolean
}

/**
 * The Payments section of the General tab (board 7). Placed by MainTab only
 * while the payments feature is on.
 */
export const PaymentSettingsFields: React.FC<PaymentSettingsFieldsProps> = ({
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
