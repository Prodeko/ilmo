import { memo, useCallback, useMemo, useState } from "react"
import {
  EventPage_QuestionFragment,
  ListEventRegistrationsDocument,
  PaymentMode,
  Registration,
  RegistrationPaymentStatus,
  RegistrationStatus,
  useEventPaymentSummaryQuery,
} from "@app/graphql"
import { arePropsEqual, downloadRegistrations, Sorter } from "@app/lib"
import { Typography } from "antd"
import dayjs from "dayjs"
import { useRouter } from "next/router"

import {
  EventRegistrationAnswersPopover,
  ServerPaginatedTable,
  useIsMobile,
  useTranslation,
} from "../."

import {
  PaymentFilter,
  PaymentStatusTag,
  PaymentSummary,
  PaymentToolbar,
} from "./RegistrationsPayments"
import { RegistrationsTableActions } from "./RegistrationsTableActions"

const { Text } = Typography

interface RegistrationsTabProps {
  eventId: string
  eventSlug: string
  questions: EventPage_QuestionFragment[] | undefined
  paymentsEnabled?: boolean
}

// Registrations holding a spot, which are the ones the payment summary counts
const IN_SPOT = [RegistrationStatus.InQuota, RegistrationStatus.InOpenQuota]

const PAYMENT_FILTER_VARIABLES: Record<PaymentFilter, Record<string, any>> = {
  all: {},
  unpaid: {
    paymentStatus: { equalTo: RegistrationPaymentStatus.Unpaid },
    status: { in: IN_SPOT },
  },
  paid: {
    paymentStatus: {
      in: [
        RegistrationPaymentStatus.Paid,
        RegistrationPaymentStatus.PaidManually,
      ],
    },
    status: { in: IN_SPOT },
  },
}

// Sort order of the Payment column: unpaid first, as organizers act on them
const PAYMENT_SORT_ORDER: Record<RegistrationPaymentStatus, number> = {
  [RegistrationPaymentStatus.Unpaid]: 0,
  [RegistrationPaymentStatus.Paid]: 1,
  [RegistrationPaymentStatus.PaidManually]: 2,
  [RegistrationPaymentStatus.Refunded]: 3,
  [RegistrationPaymentStatus.NotRequired]: 4,
}

// The table's sorters get the column values (see ServerPaginatedTable)
const paymentSorter = (a: string | null, b: string | null) =>
  (PAYMENT_SORT_ORDER[a as RegistrationPaymentStatus] ?? 5) -
  (PAYMENT_SORT_ORDER[b as RegistrationPaymentStatus] ?? 5)

export const RegistrationsTab: React.FC<RegistrationsTabProps> = memo(
  ({ eventId, eventSlug, questions, paymentsEnabled = false }) => {
    const router = useRouter()
    const { t, lang } = useTranslation("events")
    const isMobile = useIsMobile()
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all")

    const [{ data: summaryData }, refetchSummary] = useEventPaymentSummaryQuery(
      {
        variables: { id: eventId },
        pause: !paymentsEnabled || !eventId,
      }
    )
    const paymentEvent = summaryData?.event
    const summary = paymentEvent?.paymentSummary
    const paymentMode = paymentEvent?.paymentMode ?? PaymentMode.None
    // Payments made before the event was switched to no payments are still
    // shown, so organizers can see who paid.
    const showPayments =
      paymentsEnabled &&
      !!summary &&
      (paymentMode !== PaymentMode.None || (summary.paidCount ?? 0) > 0)

    const onPaymentChange = useCallback(() => {
      refetchSummary({ requestPolicy: "network-only" })
    }, [refetchSummary])

    const actionsColumn = {
      title: "",
      key: "actions",
      width: !isMobile ? (showPayments ? 200 : 160) : 1,
      ellipsis: true,
      render: (_value: string, row: Registration) => (
        <RegistrationsTableActions
          questions={questions}
          registration={row}
          showPayments={showPayments}
          onPaymentChange={onPaymentChange}
        />
      ),
    }

    const paymentColumn = {
      title: t("admin:payments.paymentColumn"),
      dataIndex: ["paymentStatus"],
      key: "paymentStatus",
      width: 130,
      sorter: {
        compare: paymentSorter as (a: string, b: string) => number,
      },
      render: (value: RegistrationPaymentStatus | null, row: Registration) => (
        <PaymentStatusTag
          paymentStatus={value}
          queued={row.status === RegistrationStatus.InQueue}
        />
      ),
    }

    const nameAndQuotaColumns = [
      {
        title: t("common:name"),
        dataIndex: ["fullName"],
        key: "fullName",
        ellipsis: true,
        sorter: {
          compare: Sorter.TEXT,
        },
      },
      {
        title: t("events:quota"),
        dataIndex: ["quota", "title", lang],
        width: 80,
        key: "quota",
        sorter: {
          compare: Sorter.TEXT,
        },
      },
    ]

    const commonColumns = [actionsColumn, ...nameAndQuotaColumns]

    const emailAndQueuedColumns = [
      {
        title: t("common:email"),
        dataIndex: ["email"],
        key: "email",
        ellipsis: true,
        sorter: {
          compare: Sorter.TEXT,
        },
      },
      {
        title: t("events:queued"),
        dataIndex: ["status"],
        key: "status",
        width: 80,
        render: (value: string) =>
          value === RegistrationStatus.InQueue ? (
            <Text type="danger">{t("common:yes")}</Text>
          ) : (
            <Text type="success">{t("common:no")}</Text>
          ),
      },
    ]

    const otherColumns = [
      {
        title: t("common:answers"),
        dataIndex: ["answers"],
        key: "answers",
        ellipsis: true,
        render: (_value: string, row: Registration) => (
          <EventRegistrationAnswersPopover
            questions={questions}
            registration={row}
          />
        ),
      },
      {
        title: t("common:createdAt"),
        dataIndex: ["createdAt"],
        key: "createdAt",
        render: (value: string) => dayjs(value).format("l LT ss.SSS"),
      },
      {
        title: t("common:updatedAt"),
        dataIndex: ["updatedAt"],
        key: "updatedAt",
        render: (value: string, row: Registration) =>
          value !== row.createdAt
            ? dayjs(value).format("l LT ss.SSS")
            : t("common:no"),
      },
    ]

    // With payments the row actions sit at the right end of the row and a
    // Payment column follows the queue status (board 9).
    const columns = showPayments
      ? !isMobile
        ? [
            ...nameAndQuotaColumns,
            ...emailAndQueuedColumns,
            paymentColumn,
            ...otherColumns,
            actionsColumn,
          ]
        : [...nameAndQuotaColumns, paymentColumn, actionsColumn]
      : !isMobile
        ? [...commonColumns, ...emailAndQueuedColumns, ...otherColumns]
        : commonColumns

    const filter = showPayments ? paymentFilter : "all"
    const variables = useMemo(
      () => ({ eventId: router.query.id, ...PAYMENT_FILTER_VARIABLES[filter] }),
      [router.query.id, filter]
    )

    return (
      <>
        {showPayments && (
          <>
            <PaymentSummary summary={summary} />
            <PaymentToolbar
              eventId={eventId}
              filter={paymentFilter}
              lastReminderSentAt={paymentEvent?.lastPaymentReminderSentAt}
              paymentMode={paymentMode}
              summary={summary}
              totalCount={paymentEvent?.registrations?.totalCount ?? 0}
              onFilterChange={setPaymentFilter}
              onRemindersSent={onPaymentChange}
            />
          </>
        )}
        <ServerPaginatedTable
          // Remount on filter change so pagination starts from the first page
          key={filter}
          columns={columns}
          data-cy="eventform-tab-registrations-table"
          dataField="registrations"
          downloadFilename={`${eventSlug}-registrations.csv`}
          downloadFunction={downloadRegistrations(questions, {
            includePayments: showPayments,
            paymentStatusLabel: (status) =>
              t(`admin:payments.status.${status}`),
          })}
          queryDocument={ListEventRegistrationsDocument}
          size="small"
          variables={variables}
          showDownload
          showPagination
          showSizeChanger
        />
      </>
    )
  },
  arePropsEqual
)
