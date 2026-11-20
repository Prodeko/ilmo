import { EyeOutlined } from "@ant-design/icons"
import { Space, Tag, Typography } from "antd"
import * as NextLink from "next/link"
import useTranslation from "next-translate/useTranslation"

import { useFeatureFlags } from "./Feature"

const { Text } = Typography

// See SharedLayout.tsx for why the default export is read this way.
const Link = NextLink.default

interface PreviewTagProps {
  /** Only the tag, without the line on who can release the feature. */
  compact?: boolean
}

/**
 * Marks UI that the viewer sees only because its feature is in admins_only.
 * Developers get a link to the Features page; other admins are told to ask a
 * developer.
 */
export function PreviewTag({ compact = false }: PreviewTagProps) {
  const { t } = useTranslation("common")
  const { isDeveloper } = useFeatureFlags()

  const tag = (
    <Tag color="gold" data-cy="preview-tag" icon={<EyeOutlined />}>
      {t("featurePreview.tag")}
    </Tag>
  )
  if (compact) {
    return tag
  }
  return (
    <Space direction="vertical" size={4}>
      {tag}
      <Text style={{ fontSize: 12 }} type="secondary">
        {isDeveloper ? (
          <>
            {t("featurePreview.developerHint")}{" "}
            <Link data-cy="preview-tag-manage" href="/admin/features">
              {t("featurePreview.manage")}
            </Link>
          </>
        ) : (
          t("featurePreview.adminHint")
        )}
      </Text>
    </Space>
  )
}
