import { CancelRefund, formatEuro } from "@app/lib"
import { Typography } from "antd"

import type { CSSProperties, ReactNode } from "react"

const { Text } = Typography

export const paymentBoxStyle: CSSProperties = {
  border: "1px solid #d9e3f2",
  background: "#f5faff",
  borderRadius: 8,
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
}

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
}

interface AmountRowProps {
  label: ReactNode
  cents: number
  lang?: string
  strong?: boolean
  negative?: boolean
  "data-cy"?: string
}

/** One "label … 18,00 €" line of a price breakdown. */
export const AmountRow: React.FC<AmountRowProps> = ({
  label,
  cents,
  lang,
  strong = false,
  negative = false,
  "data-cy": dataCy,
}) => (
  <div
    style={{
      ...rowStyle,
      ...(strong
        ? { fontWeight: 700, borderTop: "1px solid #d9e3f2", paddingTop: 6 }
        : {}),
    }}
  >
    <span>{label}</span>
    <span data-cy={dataCy}>
      {negative ? "−" : ""}
      {formatEuro(cents, lang)}
    </span>
  </div>
)

interface PriceBreakdownProps {
  ticketLabel: ReactNode
  serviceFeeLabel: ReactNode
  totalLabel: ReactNode
  priceCents: number
  serviceFeeCents: number
  totalCents: number
  lang?: string
}

/** Ticket, service fee and total, as on boards 2 and 4. */
export const PriceBreakdown: React.FC<PriceBreakdownProps> = ({
  ticketLabel,
  serviceFeeLabel,
  totalLabel,
  priceCents,
  serviceFeeCents,
  totalCents,
  lang,
}) => (
  <>
    <AmountRow cents={priceCents} label={ticketLabel} lang={lang} />
    <AmountRow cents={serviceFeeCents} label={serviceFeeLabel} lang={lang} />
    <AmountRow
      cents={totalCents}
      data-cy="payment-total"
      label={totalLabel}
      lang={lang}
      strong
    />
  </>
)

interface CancelRefundBreakdownProps {
  refund: CancelRefund
  paidLabel: ReactNode
  feeLabel: ReactNode
  refundLabel: ReactNode
  lang?: string
}

/** What a cancelling participant paid and gets back (board 6). */
export const CancelRefundBreakdown: React.FC<CancelRefundBreakdownProps> = ({
  refund,
  paidLabel,
  feeLabel,
  refundLabel,
  lang,
}) => (
  <div data-cy="cancel-refund-breakdown" style={paymentBoxStyle}>
    <AmountRow cents={refund.paidCents} label={paidLabel} lang={lang} />
    <AmountRow
      cents={refund.serviceFeeCents}
      label={feeLabel}
      lang={lang}
      negative
    />
    <AmountRow
      cents={refund.refundCents}
      data-cy="cancel-refund-amount"
      label={refundLabel}
      lang={lang}
      strong
    />
  </div>
)

export const PaymentNote: React.FC<{ children: ReactNode }> = ({
  children,
}) => (
  <Text style={{ fontSize: 13, lineHeight: 1.5 }} type="secondary">
    {children}
  </Text>
)
