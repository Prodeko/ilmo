import { Event } from "@app/graphql"
import { secondaryColor } from "@app/lib"
import { Col, Popover, Progress, Row, Typography } from "antd"
import reduce from "lodash/reduce"
import useTranslation from "next-translate/useTranslation"

const { Text } = Typography

interface EventQuotaPopoverProps {
  event: Event
  showText?: boolean
}

const numberStyle = {
  whiteSpace: "nowrap",
  letterSpacing: "-1px",
  fontVariantNumeric: "slashed-zero",
} as React.CSSProperties

export const EventQuotaPopover: React.FC<EventQuotaPopoverProps> = ({
  event,
  showText = false,
}) => {
  const { t, lang } = useTranslation("admin")

  const popoverContent = event.quotas.nodes.map((quota) => {
    const quotaRegistrations = quota.registrations.totalCount
    return (
      <Row key={quota.id} style={{ minWidth: "20rem" }}>
        <Col span={5}>{quota.title[lang]}</Col>
        <Col span={12} style={{ marginRight: "10px" }}>
          <Progress
            percent={(quotaRegistrations * 100) / quota.size}
            showInfo={false}
            strokeColor={secondaryColor}
          />
        </Col>
        <Col flex="auto" style={{ whiteSpace: "nowrap" }}>
          <span style={numberStyle}>
            {quotaRegistrations} / {quota.size}
          </span>
        </Col>
      </Row>
    )
  })

  const numRegistrations = event.registrations.totalCount
  const totalSize = reduce(
    event.quotas.nodes,
    (acc: number, quota) => acc + quota.size,
    0
  )
  return (
    <Popover content={popoverContent} title={t("common:registrationsPerQuota")}>
      <Row align="middle">
        <Col flex="none">
          {showText && <Text strong>{t("common:registrations")}: </Text>}
          <Text style={numberStyle}>
            {numRegistrations} / {totalSize}
          </Text>
        </Col>
        <Col flex="auto" style={{ marginLeft: "8px" }}>
          <Progress
            percent={(numRegistrations * 100) / totalSize}
            showInfo={false}
            strokeColor={secondaryColor}
          />
        </Col>
      </Row>
    </Popover>
  )
}
