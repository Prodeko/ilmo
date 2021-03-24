import React, { useMemo } from "react";
import { Registration } from "@app/graphql";
import { Skeleton } from "antd";
import dayjs from "dayjs";
import useTranslation from "next-translate/useTranslation";

import { H4 } from "./Text";
import { SimpleTable } from ".";

interface EventRegistrationsTable {
  registrations: Registration[];
}

const getRegistrationsByQuotaId = (arr: any[]) => {
  return arr.reduce((a, x) => {
    const key = x?.quota?.id;
    (a[key] || (a[key] = [] || [])).push(x);
    return a;
  }, {});
};

const getQueuedRegistrations = (arr: any[]) => {
  return arr.filter((x) => x.isQueued);
};

const getQuotaNameByQuotaId = (arr: any[]) => {
  return arr
    .map((x) => x.quota)
    .reduce((a, x) => {
      a[x.id] = x;
      return a;
    }, {});
};

export const EventRegistrationsTable: React.FC<EventRegistrationsTable> = ({
  registrations,
}) => {
  const { t, lang } = useTranslation("events");

  const commonColumns = [
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
      render: (createdAt: string) => dayjs(createdAt).format("l LT"),
    },
  ];
  const quotaColumns = [...commonColumns];
  const queuedColumns = [
    {
      title: t("quota"),
      dataIndex: ["quota", "title", lang],
      key: "quota",
    },
    ...commonColumns,
  ];

  const registrationsByQuotaId = useMemo(
    () => getRegistrationsByQuotaId(registrations),
    [registrations]
  );
  const quotaNamesById = useMemo(() => getQuotaNameByQuotaId(registrations), [
    registrations,
  ]);
  const queuedRegistrations = useMemo(
    () => getQueuedRegistrations(registrations),
    [registrations]
  );

  return (
    <>
      {Object.keys(registrationsByQuotaId)
        .sort()
        .map((quotaId) => {
          const quotaTitle = quotaNamesById[quotaId].title[lang];
          const quotaSize = quotaNamesById[quotaId].size;
          const quotaRegistrations = registrationsByQuotaId[quotaId].filter(
            (r: Registration) => !r.isQueued
          );
          return (
            <div key={quotaId}>
              <H4 style={{ marginTop: "1.5rem" }}>
                {quotaTitle} – {quotaRegistrations?.length} / {quotaSize}
              </H4>
              <SimpleTable
                columns={quotaColumns}
                data={quotaRegistrations}
                data-cy="eventpage-signups-table"
                size="small"
                style={{
                  margin: "1rem 0",
                }}
              />
            </div>
          );
        })}
      <H4 style={{ marginTop: "1.5rem" }}>{t("queued")}</H4>
      <SimpleTable
        columns={queuedColumns}
        data={queuedRegistrations}
        data-cy="eventpage-signups-table"
        size="small"
        style={{
          margin: "1rem 0",
        }}
      />
    </>
  );
};
