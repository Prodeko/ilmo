import { ArrowRightOutlined } from "@ant-design/icons"
import { FeatureState } from "@app/graphql"
import { Drawer, Empty, List, Select, Space, Tag, Typography } from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { eventsOf, FeatureFlagEvent, stateKey } from "./transitions"

import type { AdminFeatures_FeatureFlagFragment } from "@app/graphql"

const { Text } = Typography

export const STATE_TAG_COLOR: Record<FeatureState, string | undefined> = {
  [FeatureState.Off]: undefined,
  [FeatureState.AdminsOnly]: "gold",
  [FeatureState.On]: "geekblue",
}

interface FeatureHistoryDrawerProps {
  open: boolean
  /** The flag to show, or null for all flags. */
  scope: string | null
  flags: readonly AdminFeatures_FeatureFlagFragment[]
  events: readonly (FeatureFlagEvent | null)[]
  nameOf: (key: string) => string
  actorOf: (event: FeatureFlagEvent) => string
  onScopeChange: (scope: string | null) => void
  onClose: () => void
}

const ALL = "__all__"

/** The audit log of flag changes, for one flag or all of them. */
export function FeatureHistoryDrawer({
  open,
  scope,
  flags,
  events,
  nameOf,
  actorOf,
  onScopeChange,
  onClose,
}: FeatureHistoryDrawerProps) {
  const { t } = useTranslation("admin")
  const shown = scope
    ? eventsOf(events, scope)
    : events.filter((event): event is FeatureFlagEvent => Boolean(event))
  const oldest = shown[shown.length - 1]
  const stateTag = (state: FeatureState | null | undefined) =>
    state ? (
      <Tag color={STATE_TAG_COLOR[state]}>
        {t(`features.states.${stateKey(state)}`)}
      </Tag>
    ) : null

  let footer: string
  if (shown.length === 0) {
    footer = t("features.historyDrawer.none")
  } else if (scope) {
    footer = t("features.historyDrawer.footerOne", {
      date: dayjs(oldest.createdAt).format("l"),
      name: nameOf(scope),
    })
  } else {
    footer = t("features.historyDrawer.footerAll", { count: shown.length })
  }

  return (
    <Drawer
      data-cy="feature-history-drawer"
      open={open}
      title={
        scope
          ? t("features.historyDrawer.titleFor", { name: nameOf(scope) })
          : t("features.historyDrawer.title")
      }
      width={520}
      onClose={onClose}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <Text strong>{t("features.historyDrawer.feature")}</Text>
          <Select
            data-cy="feature-history-scope"
            options={[
              { value: ALL, label: t("features.historyDrawer.allFeatures") },
              ...flags.map((flag) => ({
                value: flag.key,
                label: nameOf(flag.key),
              })),
            ]}
            style={{ width: "100%" }}
            value={scope ?? ALL}
            onChange={(value) => onScopeChange(value === ALL ? null : value)}
          />
        </Space>
        {shown.length > 0 ? (
          <List
            dataSource={shown}
            renderItem={(event) => (
              <List.Item key={event.id} data-cy="feature-history-event">
                <Space direction="vertical" size={4}>
                  {scope ? null : (
                    <Space size={8} wrap>
                      <Text strong>{nameOf(event.key ?? "")}</Text>
                      <Text code>{event.key}</Text>
                    </Space>
                  )}
                  <Space size={4}>
                    {stateTag(event.oldState)}
                    <ArrowRightOutlined aria-hidden />
                    {stateTag(event.newState)}
                  </Space>
                  <Text type="secondary">
                    {t("features.historyDrawer.by", {
                      actor: actorOf(event),
                      date: dayjs(event.createdAt).format("l LT"),
                    })}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty description={false} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        <Text type="secondary">{footer}</Text>
      </Space>
    </Drawer>
  )
}
