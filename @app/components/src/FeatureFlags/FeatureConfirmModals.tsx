import { FeatureState } from "@app/graphql"
import { Alert, Button, Modal, Space, Typography } from "antd"
import dayjs from "dayjs"
import useTranslation from "next-translate/useTranslation"

import { PreviewInfo, stateKey } from "./transitions"

const { Paragraph, Text } = Typography

type Translate = ReturnType<typeof useTranslation>["t"]

/**
 * A list from an optional per-feature translation, e.g.
 * `features.flags.payments.stops` in admin.json. Empty when there is none.
 */
export const translatedList = (t: Translate, key: string): string[] => {
  const value: unknown = t(key, null, { returnObjects: true })
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

const Bullets = ({ items, cy }: { items: string[]; cy?: string }) => (
  <ul data-cy={cy} style={{ margin: "4px 0 0", paddingInlineStart: 20 }}>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
)

interface ConfirmOnModalProps {
  open: boolean
  flagKey: string
  name: string
  preview: PreviewInfo
  actorOf: (event: NonNullable<PreviewInfo["lastPreviewStart"]>) => string
  onConfirm: (state: FeatureState) => void
  onCancel: () => void
}

/** Confirms a change into On, suggesting a preview first if none happened. */
export function ConfirmOnModal({
  open,
  flagKey,
  name,
  preview,
  actorOf,
  onConfirm,
  onCancel,
}: ConfirmOnModalProps) {
  const { t } = useTranslation("admin")
  const specific = translatedList(t, `features.flags.${flagKey}.turnOn`)
  const willSee =
    specific.length > 0 ? specific : [t("features.confirmOn.generic", { name })]
  const { previewable, previewed, lastPreviewStart } = preview
  // Without a preview there is nothing to suggest or warn about
  const suggestPreview = previewable && !previewed

  const footer = [
    <Button key="cancel" data-cy="feature-confirm-cancel" onClick={onCancel}>
      {t("features.cancel")}
    </Button>,
    <Button
      key="on"
      data-cy="feature-confirm-on"
      type={suggestPreview ? "default" : "primary"}
      onClick={() => onConfirm(FeatureState.On)}
    >
      {t("features.confirmOn.ok")}
    </Button>,
    ...(!suggestPreview
      ? []
      : [
          <Button
            key="preview"
            data-cy="feature-confirm-preview"
            type="primary"
            onClick={() => onConfirm(FeatureState.AdminsOnly)}
          >
            {t("features.confirmOn.preview")}
          </Button>,
        ]),
  ]

  return (
    <Modal
      data-cy="feature-confirm-on-modal"
      footer={footer}
      open={open}
      title={t("features.confirmOn.title", { name })}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div>
          <Text>{t("features.confirmOn.willSee")}</Text>
          <Bullets items={willSee} />
        </div>
        {!previewable ? null : previewed ? (
          <Alert
            data-cy="feature-confirm-previewed"
            message={
              lastPreviewStart
                ? t("features.confirmOn.previewedSince", {
                    date: dayjs(lastPreviewStart.createdAt).format("l"),
                    actor: actorOf(lastPreviewStart),
                  })
                : t("features.confirmOn.previewing")
            }
            type="info"
            showIcon
          />
        ) : (
          <Alert
            data-cy="feature-confirm-never-previewed"
            message={t("features.confirmOn.neverPreviewed")}
            type="warning"
            showIcon
          />
        )}
        <Paragraph style={{ margin: 0 }} type="secondary">
          {t("features.confirmOn.appliesNow")}
        </Paragraph>
      </Space>
    </Modal>
  )
}

interface ConfirmLeaveOnModalProps {
  open: boolean
  flagKey: string
  name: string
  /** Off or Admins only. */
  target: FeatureState
  onConfirm: () => void
  onCancel: () => void
}

/** Confirms a change out of On: what stops and what keeps working. */
export function ConfirmLeaveOnModal({
  open,
  flagKey,
  name,
  target,
  onConfirm,
  onCancel,
}: ConfirmLeaveOnModalProps) {
  const { t } = useTranslation("admin")
  const targetKey = stateKey(target) as "off" | "admins_only"
  const stops = translatedList(t, `features.flags.${flagKey}.stops`)
  const keeps = translatedList(t, `features.flags.${flagKey}.keeps`)

  return (
    <Modal
      data-cy="feature-confirm-leave-on-modal"
      footer={[
        <Button
          key="cancel"
          data-cy="feature-confirm-cancel"
          onClick={onCancel}
        >
          {t("features.cancel")}
        </Button>,
        <Button
          key="ok"
          data-cy="feature-confirm-leave-on"
          type="primary"
          danger
          onClick={onConfirm}
        >
          {t(`features.confirmOff.ok.${targetKey}`, { name })}
        </Button>,
      ]}
      open={open}
      title={t(`features.confirmOff.title.${targetKey}`, { name })}
      onCancel={onCancel}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Paragraph style={{ margin: 0 }}>
          {t(`features.confirmOff.intro.${targetKey}`)}
        </Paragraph>
        <div>
          <Text strong>{t("features.confirmOff.stops")}</Text>
          <Bullets
            cy="feature-confirm-stops"
            items={
              stops.length > 0
                ? stops
                : [t("features.confirmOff.genericStops", { name })]
            }
          />
        </div>
        <div>
          <Text strong>{t("features.confirmOff.keeps")}</Text>
          <Bullets
            cy="feature-confirm-keeps"
            items={
              keeps.length > 0 ? keeps : [t("features.confirmOff.genericKeeps")]
            }
          />
        </div>
      </Space>
    </Modal>
  )
}
