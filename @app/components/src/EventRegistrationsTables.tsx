import { memo, useMemo } from "react"
import {
  EventPage_EventFragment,
  EventPage_QuotaFragment,
  EventPage_RegistrationFragment,
  RegistrationStatus,
} from "@app/graphql"
import { arePropsEqual } from "@app/lib"
import { Skeleton } from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { H4 } from "./Text"
import { SimpleTable } from "."

interface EventRegistrationsTablesProps {
  event: EventPage_EventFragment
  registrations: EventPage_RegistrationFragment[]
}

const getRegistrationsByQuotaPosition = (
  arr: EventPage_RegistrationFragment[]
) => {
  return arr.reduce((a, x) => {
    const key = x?.quota?.position
    // @ts-ignore
    ;(a[key] || (a[key] = [] || [])).push(x)
    return a
  }, {} as { [key: number]: EventPage_RegistrationFragment })
}

const getQuotaNameByQuotaPosition = (arr: EventPage_RegistrationFragment[]) => {
  return arr
    .map((x) => x.quota)
    .reduce((a, x) => {
      if (x) {
        a[x.position] = x
      }
      return a
    }, {} as { [key: number]: EventPage_QuotaFragment })
}

const getQueuedRegistrations = (arr: EventPage_RegistrationFragment[]) => {
  return arr.filter((x) => x.status === RegistrationStatus.InQueue)
}

const getOpenQuotaRegistrations = (arr: EventPage_RegistrationFragment[]) => {
  return arr.filter((x) => x.status === RegistrationStatus.InOpenQuota)
}

export const EventRegistrationsTables: React.FC<EventRegistrationsTablesProps> =
  memo(({ event, registrations }) => {
    const { t, lang } = useTranslation("events")

    const commonColumns = [
      {
        title: t("common:position"),
        dataIndex: "position",
        key: "position",
        render: (position: number) => `${position}.`,
      },
      {
        title: t("common:name"),
        dataIndex: "fullName",
        key: "fullName",
        render: (fullName: string) =>
          fullName ? (
            fullName
          ) : (
            <Skeleton.Input active={true} size="small" style={{ width: 120 }} />
          ),
      },
      {
        title: t("createdAt"),
        dataIndex: "createdAt",
        key: "createdAt",
        render: (createdAt: string) => {
          const registrationStart = dayjs(event.registrationStartTime)
          const cur = dayjs(createdAt)
          const commonFormat = "YYYY-MM-DD HH:mm:ss"
          const formatOptions =
            cur.diff(registrationStart) < 1000
              ? `${commonFormat}.SSS`
              : `${commonFormat}`
          return cur.format(formatOptions)
        },
      },
    ]
    const quotaColumns = [...commonColumns]
    const queueAndOpenQuotaColumns = [
      ...commonColumns,
      {
        title: t("quota"),
        dataIndex: ["quota", "title", lang],
        key: "quota",
      },
    ]

    const registrationsByQuotaPosition = useMemo(
      () => getRegistrationsByQuotaPosition(registrations),
      [registrations]
    )
    const quotaNamesByPosition = useMemo(
      () => getQuotaNameByQuotaPosition(registrations),
      [registrations]
    )
    const queuedRegistrations = useMemo(
      () => getQueuedRegistrations(registrations),
      [registrations]
    )
    const openQuotaRegistrations = useMemo(
      () => getOpenQuotaRegistrations(registrations),
      [registrations]
    )

    return (
      <>
        {Object.keys(registrationsByQuotaPosition)
          .sort()
          .map((position) => {
            const quotaTitle = quotaNamesByPosition[position].title[
              lang
            ] as string
            const quotaSize = quotaNamesByPosition[position].size as number
            const quotaRegistrations = registrationsByQuotaPosition[
              position
            ].filter(
              (r: EventPage_RegistrationFragment) =>
                r.status === RegistrationStatus.InQuota
            )
            return (
              <div key={position}>
                <H4 style={{ marginTop: "1.5rem" }}>
                  {quotaTitle} – {quotaRegistrations?.length} / {quotaSize}
                </H4>
                <SimpleTable
                  columns={quotaColumns}
                  data={quotaRegistrations}
                  data-cy={`eventpage-signups-quota-${position}-table`}
                  style={{
                    margin: "1rem 0",
                  }}
                />
              </div>
            )
          })}
        {openQuotaRegistrations.length > 0 && (
          <>
            <H4 style={{ marginTop: "1.5rem" }}>{t("openQuota")}</H4>
            <SimpleTable
              columns={queueAndOpenQuotaColumns}
              data={openQuotaRegistrations}
              data-cy="eventpage-signups-open-table"
              style={{
                margin: "1rem 0",
              }}
            />
          </>
        )}
        {queuedRegistrations.length > 0 && (
          <>
            <H4 style={{ marginTop: "1.5rem" }}>{t("queued")}</H4>
            <SimpleTable
              columns={queueAndOpenQuotaColumns}
              data={queuedRegistrations}
              data-cy="eventpage-signups-queued-table"
              style={{
                margin: "1rem 0",
              }}
            />
          </>
        )}
      </>
    )
  }, arePropsEqual)