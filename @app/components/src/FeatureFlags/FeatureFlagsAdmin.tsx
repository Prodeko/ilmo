import { useCallback, useMemo, useState } from "react"
import { HistoryOutlined } from "@ant-design/icons"
import {
  AdminFeatures_FeatureFlagFragment,
  FeatureState,
  useAdminFeaturesQuery,
  useSetFeatureFlagMutation,
} from "@app/graphql"
import {
  Alert,
  Button,
  Card,
  Empty,
  Grid,
  List,
  message,
  Result,
  Space,
  Table,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { LoadingPadded } from "../Loading"
import { PageHeader } from "../PageHeader"

import { ConfirmLeaveOnModal, ConfirmOnModal } from "./FeatureConfirmModals"
import { FeatureHistoryDrawer, STATE_TAG_COLOR } from "./FeatureHistoryDrawer"
import { FeatureStateControl } from "./FeatureStateControl"
import {
  eventsOf,
  FEATURE_STATES,
  FeatureFlagEvent,
  previewInfo,
  stateKey,
  transition,
} from "./transitions"

import type { ColumnsType } from "antd/es/table"

const { Paragraph, Text } = Typography

type Flag = AdminFeatures_FeatureFlagFragment

interface FeatureFlagsAdminProps {
  /** The signed-in developer, to mark their own changes. */
  currentUserId: string
}

/**
 * The body of /admin/features: every flag with a three-way control, change
 * confirmations, and the change history. Render it for developers only; the
 * database refuses the query and the mutation for anyone else.
 */
export function FeatureFlagsAdmin({ currentUserId }: FeatureFlagsAdminProps) {
  const { t } = useTranslation("admin")
  const screens = Grid.useBreakpoint()
  const narrow = !screens.md
  const [query, refetch] = useAdminFeaturesQuery()
  const [, setFeatureFlag] = useSetFeatureFlagMutation()

  const [saving, setSaving] = useState<Record<string, FeatureState>>({})
  const [failed, setFailed] = useState<Record<string, FeatureState>>({})
  const [confirmOn, setConfirmOn] = useState<Flag | null>(null)
  const [confirmLeaveOn, setConfirmLeaveOn] = useState<{
    flag: Flag
    target: FeatureState
  } | null>(null)
  const [history, setHistory] = useState<{
    open: boolean
    scope: string | null
  }>({ open: false, scope: null })

  const flags = useMemo(
    () =>
      (query.data?.featureFlags?.nodes ?? []).filter((flag): flag is Flag =>
        Boolean(flag)
      ),
    [query.data]
  )
  const events = useMemo(
    () => query.data?.featureFlagEventsList ?? [],
    [query.data]
  )

  const nameOf = useCallback(
    (key: string) => t(`features.flags.${key}.name`, null, { default: key }),
    [t]
  )
  const actorOf = useCallback(
    (event: FeatureFlagEvent): string => {
      const name: string =
        event.actorName ||
        event.actorUsername ||
        String(t("features.deletedUser"))
      return event.actorId && event.actorId === currentUserId
        ? t("features.you", { name })
        : name
    },
    [currentUserId, t]
  )

  const save = useCallback(
    async (flag: Flag, target: FeatureState) => {
      setSaving((s) => ({ ...s, [flag.key]: target }))
      setFailed(({ [flag.key]: _, ...rest }) => rest)
      const { error } = await setFeatureFlag({
        input: { key: flag.key, state: target },
      })
      setSaving(({ [flag.key]: _, ...rest }) => rest)
      if (error) {
        setFailed((s) => ({ ...s, [flag.key]: target }))
        return
      }
      message.success({
        key: `feature-saved-${flag.key}`,
        content: t(`features.saved.${stateKey(target)}`, {
          name: nameOf(flag.key),
        }),
      })
    },
    [nameOf, setFeatureFlag, t]
  )

  const pick = useCallback(
    (flag: Flag, target: FeatureState) => {
      switch (transition(flag.state, target)) {
        case "immediate":
          save(flag, target)
          break
        case "confirmOn":
          setConfirmOn(flag)
          break
        case "confirmLeaveOn":
          setConfirmLeaveOn({ flag, target })
          break
        case "none":
          break
      }
    },
    [save]
  )

  if (!query.data && (query.fetching || query.stale)) {
    return <LoadingPadded size="huge" />
  }

  if (query.error && !query.data) {
    return (
      <Result
        data-cy="features-load-error"
        extra={
          <Button
            type="primary"
            onClick={() => refetch({ requestPolicy: "network-only" })}
          >
            {t("features.loadError.tryAgain")}
          </Button>
        }
        status="warning"
        subTitle={
          <Space direction="vertical">
            <span>{t("features.loadError.description")}</span>
            <Text code>{query.error.message}</Text>
          </Space>
        }
        title={t("features.loadError.title")}
      />
    )
  }

  const openHistory = (scope: string | null) =>
    setHistory({ open: true, scope })

  const lastChanged = (flag: Flag) => {
    const [latest] = eventsOf(events, flag.key)
    if (latest) {
      return {
        by: actorOf(latest),
        at: dayjs(latest.createdAt).format("l LT"),
      }
    }
    if (flag.state === FeatureState.Off) {
      return { by: t("features.neverChanged"), at: t("features.defaultOff") }
    }
    return {
      by: t("features.changedOutside"),
      at: dayjs(flag.updatedAt).format("l LT"),
    }
  }

  const control = (flag: Flag) => (
    <FeatureStateControl
      compact={narrow}
      failed={failed[flag.key]}
      flag={flag}
      name={nameOf(flag.key)}
      saving={saving[flag.key]}
      onDismiss={() => setFailed(({ [flag.key]: _, ...rest }) => rest)}
      onPick={(target) => pick(flag, target)}
      onRetry={() => {
        const target = failed[flag.key]
        if (target) {
          pick(flag, target)
        }
      }}
    />
  )

  const featureCell = (flag: Flag) => (
    <Space direction="vertical" size={4}>
      <Space size={8} wrap>
        <Text strong>{nameOf(flag.key)}</Text>
        <Text code>{flag.key}</Text>
      </Space>
      <Text type="secondary">{flag.description}</Text>
    </Space>
  )

  const historyButton = (flag: Flag) => (
    <Button
      aria-label={t("features.historyLabel", { name: nameOf(flag.key) })}
      data-cy={`feature-${flag.key}-history`}
      size="small"
      type="link"
      onClick={() => openHistory(flag.key)}
    >
      {t("features.history")}
    </Button>
  )

  const columns: ColumnsType<Flag> = [
    {
      key: "feature",
      title: t("features.columns.feature"),
      render: (_, flag) => featureCell(flag),
    },
    {
      key: "state",
      title: t("features.columns.state"),
      width: 360,
      render: (_, flag) => control(flag),
    },
    {
      key: "lastChanged",
      title: t("features.columns.lastChanged"),
      width: 200,
      render: (_, flag) => {
        const { by, at } = lastChanged(flag)
        return (
          <Space direction="vertical" size={0}>
            <Text>{by}</Text>
            <Text style={{ fontSize: 13 }} type="secondary">
              {at}
            </Text>
          </Space>
        )
      },
    },
    {
      key: "actions",
      // Visually hidden: the column only holds the History links.
      title: (
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        >
          {t("features.columns.actions")}
        </span>
      ),
      width: 100,
      align: "right",
      render: (_, flag) => historyButton(flag),
    },
  ]

  const counts = FEATURE_STATES.map((state) => ({
    state,
    count: flags.filter((flag) => flag.state === state).length,
  })).reverse()

  const confirmOnPreview = confirmOn
    ? previewInfo(confirmOn, eventsOf(events, confirmOn.key))
    : null

  return (
    <div data-cy="features-page">
      <PageHeader
        extra={
          <Button
            data-cy="features-history"
            icon={<HistoryOutlined />}
            onClick={() => openHistory(null)}
          >
            {narrow ? t("features.history") : t("features.changeHistory")}
          </Button>
        }
        title={t("features.title")}
      />
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Paragraph style={{ margin: 0 }} type="secondary">
          {t("features.intro")}
          <br />
          {t("features.introDevelopers")}
        </Paragraph>
        <Alert message={t("features.adminsOnlyInfo")} type="info" showIcon />
        {flags.length === 0 ? (
          <Empty
            data-cy="features-empty"
            description={t("features.empty")}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <>
            <Space size={8} wrap>
              {counts.map(({ state, count }) => (
                <Tag
                  key={state}
                  color={STATE_TAG_COLOR[state]}
                  data-cy={`features-count-${stateKey(state)}`}
                >
                  {t(`features.counts.${stateKey(state)}`, { count })}
                </Tag>
              ))}
            </Space>
            {narrow ? (
              <List
                dataSource={flags}
                renderItem={(flag) => {
                  const changed = lastChanged(flag)
                  return (
                    <List.Item
                      key={flag.key}
                      data-cy={`feature-row-${flag.key}`}
                      style={{ padding: "8px 0" }}
                    >
                      <Card size="small" style={{ width: "100%" }}>
                        <Space
                          direction="vertical"
                          size={12}
                          style={{ width: "100%" }}
                        >
                          {featureCell(flag)}
                          {control(flag)}
                          <Space
                            style={{
                              width: "100%",
                              justifyContent: "space-between",
                            }}
                            wrap
                          >
                            <Text style={{ fontSize: 13 }} type="secondary">
                              {changed.by} · {changed.at}
                            </Text>
                            {historyButton(flag)}
                          </Space>
                        </Space>
                      </Card>
                    </List.Item>
                  )
                }}
              />
            ) : (
              <Table
                columns={columns}
                dataSource={flags}
                pagination={false}
                rowKey="key"
                onRow={(flag) =>
                  ({ "data-cy": `feature-row-${flag.key}` }) as any
                }
              />
            )}
            <Text style={{ fontSize: 13 }} type="secondary">
              {t("features.footer")}
            </Text>
          </>
        )}
      </Space>

      {confirmOn && confirmOnPreview ? (
        <ConfirmOnModal
          actorOf={actorOf}
          flagKey={confirmOn.key}
          name={nameOf(confirmOn.key)}
          preview={confirmOnPreview}
          open
          onCancel={() => setConfirmOn(null)}
          onConfirm={(target) => {
            const flag = confirmOn
            setConfirmOn(null)
            save(flag, target)
          }}
        />
      ) : null}
      {confirmLeaveOn ? (
        <ConfirmLeaveOnModal
          flagKey={confirmLeaveOn.flag.key}
          name={nameOf(confirmLeaveOn.flag.key)}
          target={confirmLeaveOn.target}
          open
          onCancel={() => setConfirmLeaveOn(null)}
          onConfirm={() => {
            const { flag, target } = confirmLeaveOn
            setConfirmLeaveOn(null)
            save(flag, target)
          }}
        />
      ) : null}
      <FeatureHistoryDrawer
        actorOf={actorOf}
        events={events}
        flags={flags}
        nameOf={nameOf}
        open={history.open}
        scope={history.scope}
        onClose={() => setHistory((h) => ({ ...h, open: false }))}
        onScopeChange={(scope) => setHistory({ open: true, scope })}
      />
    </div>
  )
}
