import { CheckOutlined, LoadingOutlined, LockOutlined } from "@ant-design/icons"
import { FeatureState } from "@app/graphql"
import {
  Button,
  ConfigProvider,
  Segmented,
  Space,
  theme,
  Typography,
} from "antd"
import useTranslation from "next-translate/useTranslation"

import { FEATURE_STATES, stateKey, stateSelectable } from "./transitions"

import type { AdminFeatures_FeatureFlagFragment } from "@app/graphql"

const { Text } = Typography

// Colours back up the labels and never replace them.
const ADMINS_ONLY_COLOR = "#ad6800"
const OFF_COLOR = "#595959"
const LOCKED_SELECTED_BG = "#d9d9d9"

interface FeatureStateControlProps {
  flag: AdminFeatures_FeatureFlagFragment
  name: string
  /** The state being saved, if any. The control is locked meanwhile. */
  saving?: FeatureState
  /** The state a failed save tried to reach, if any. */
  failed?: FeatureState
  /** Smaller control for narrow screens. */
  compact?: boolean
  onPick: (state: FeatureState) => void
  onRetry: () => void
  onDismiss: () => void
}

/**
 * The three-way control of one flag with its "who sees it" line, the saving
 * and save-failed states, and the reason when the flag cannot be switched.
 */
export function FeatureStateControl({
  flag,
  name,
  saving,
  failed,
  compact = false,
  onPick,
  onRetry,
  onDismiss,
}: FeatureStateControlProps) {
  const { t } = useTranslation("admin")
  const { token } = theme.useToken()
  const key = flag.key
  const locked = Boolean(flag.retiredAt) || !flag.available
  const lockedAll = locked && flag.state === FeatureState.Off
  const fill = {
    [FeatureState.Off]: OFF_COLOR,
    [FeatureState.AdminsOnly]: ADMINS_ONLY_COLOR,
    [FeatureState.On]: token.colorPrimary,
  }

  const options = FEATURE_STATES.map((state) => {
    const checked = state === flag.state
    const isSaving = state === saving
    return {
      value: state,
      disabled: Boolean(saving) || !stateSelectable(flag, state),
      label: (
        <span data-cy={`feature-${key}-state-${stateKey(state)}`}>
          <Space size={6}>
            {isSaving ? (
              <LoadingOutlined />
            ) : checked ? (
              <CheckOutlined aria-hidden />
            ) : null}
            {isSaving
              ? t("features.saving")
              : t(`features.states.${stateKey(state)}`)}
          </Space>
        </span>
      ),
    }
  })

  let note: React.ReactNode
  let noteType: "secondary" | "warning" | "danger" = "secondary"
  if (flag.retiredAt) {
    note = t("features.retired")
  } else if (!flag.available) {
    note = t(`features.flags.${key}.notConfigured`, null, {
      default: t("features.unavailable"),
    })
    noteType = "warning"
  } else if (saving) {
    note = t("features.savingNote")
  } else if (failed) {
    note = t(`features.saveFailed.${stateKey(failed)}`, {
      name,
      state: t(`features.states.${stateKey(flag.state)}`),
    })
    noteType = "danger"
  } else {
    note = t(`features.sees.${stateKey(flag.state)}`)
  }

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <ConfigProvider
        theme={{
          components: {
            Segmented: {
              itemSelectedBg: lockedAll ? LOCKED_SELECTED_BG : fill[flag.state],
              itemSelectedColor: lockedAll ? token.colorText : "#ffffff",
            },
          },
        }}
      >
        {/* Scrolls instead of overflowing when a translation is long. */}
        <div style={{ maxWidth: "100%", overflowX: "auto" }}>
          <Segmented
            aria-label={t("features.stateGroupLabel", { name })}
            data-cy={`feature-${key}-control`}
            options={options}
            size={compact ? "small" : "middle"}
            value={flag.state}
            onChange={(value) => onPick(value as FeatureState)}
          />
        </div>
      </ConfigProvider>
      <Text
        data-cy={`feature-${key}-note`}
        style={{ fontSize: 12 }}
        type={noteType}
      >
        {locked ? <LockOutlined style={{ marginRight: 6 }} /> : null}
        {note}
      </Text>
      {failed && !saving ? (
        <Space size={8}>
          <Button
            data-cy={`feature-${key}-retry`}
            size="small"
            onClick={onRetry}
          >
            {t("features.retry")}
          </Button>
          <Button size="small" type="text" onClick={onDismiss}>
            {t("features.dismiss")}
          </Button>
        </Space>
      ) : null}
    </Space>
  )
}
