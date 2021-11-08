import React, { useMemo } from "react"
import { Col, List, Row, Typography } from "antd"

import { useEventRegistrations, useTranslation } from "."

interface RecentRegistrationsListProps {
  eventId: string
}

export const RecentRegistrationsList: React.FC<RecentRegistrationsListProps> =
  ({ eventId }) => {
    const { t, lang } = useTranslation("register_event")
    // Subscribe to registrations created after this timestamp
    const after = useMemo(() => new Date().toISOString(), [])
    const recentRegistrations = useEventRegistrations(eventId, after)
    return (
      <>
        {recentRegistrations.length > 0 && (
          <Row align="top" justify="center">
            <Col sm={12} xs={24}>
              <List
                data-cy="eventregistrationpage-recent-registrations-list"
                dataSource={recentRegistrations}
                header={<div>{t("recentlyRegisteredHeader")}</div>}
                renderItem={(item, i) => {
                  const name = item?.fullName
                  const quota = item?.quota?.title[lang]
                  return i === 0 || name ? (
                    <List.Item>
                      <Typography.Text>
                        {i === 0
                          ? t("you")
                          : `${name} ${t(
                              "recentlyRegisteredListItem"
                            )} ${quota}`}
                      </Typography.Text>
                    </List.Item>
                  ) : null
                }}
                bordered
              />
            </Col>
          </Row>
        )}
      </>
    )
  }
