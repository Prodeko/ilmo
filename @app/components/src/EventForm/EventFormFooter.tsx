import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react"
import { LeftOutlined, RightOutlined } from "@ant-design/icons"
import { css } from "@emotion/css"
import {
  Alert,
  Button,
  Form,
  Space,
  Switch,
  theme,
  Tooltip,
  Typography,
} from "antd"

import { ErrorAlert, useTranslation } from "../."

interface FooterTab {
  key: string
  label: string
}

interface EventFormFooterProps {
  type: "update" | "create"
  // Tabs the arrow buttons move between, in order
  tabs: FooterTab[]
  activeTab: string
  setActiveTab: (tab: string) => void
  // Hides the footer without unmounting it, so the isDraft field stays
  // registered in the form while another tab is open
  hidden: boolean
  canSubmit: boolean
  // What still keeps the form from being saved
  missingFields: string[] | null
  formSubmitting: boolean
  formError: any
  // Field errors from the last save attempt
  submitErrors: string[] | null
  isDraft: boolean
  setIsDraft: Dispatch<SetStateAction<boolean>>
}

// Bar fixed to the bottom of the window with tab navigation on the left
// and the draft switch and submit button on the right
export const EventFormFooter: React.FC<EventFormFooterProps> = ({
  type,
  tabs,
  activeTab,
  setActiveTab,
  hidden,
  canSubmit,
  missingFields,
  formSubmitting,
  formError,
  submitErrors,
  isDraft,
  setIsDraft,
}) => {
  const { t } = useTranslation("events")
  const { token } = theme.useToken()
  const index = tabs.findIndex(({ key }) => key === activeTab)
  const previous = tabs[index - 1]
  const next = tabs[index + 1]

  // The bar is fixed to the window, so it follows the placeholder left in
  // its place for its horizontal position (the admin side menu collapses),
  // and the placeholder takes the bar's height so the end of the form can
  // be scrolled above it
  const placeholder = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ left: 0, width: 0 })
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (!placeholder.current || !bar.current) return
    const updateBox = () => {
      const rect = placeholder.current?.getBoundingClientRect()
      if (rect) setBox({ left: rect.left, width: rect.width })
    }
    const boxObserver = new ResizeObserver(updateBox)
    boxObserver.observe(placeholder.current)
    const heightObserver = new ResizeObserver(([entry]) =>
      setHeight(entry.borderBoxSize?.[0]?.blockSize ?? 0)
    )
    heightObserver.observe(bar.current)
    window.addEventListener("resize", updateBox)
    return () => {
      boxObserver.disconnect()
      heightObserver.disconnect()
      window.removeEventListener("resize", updateBox)
    }
  }, [])

  return (
    <div
      ref={placeholder}
      style={{
        display: hidden ? "none" : undefined,
        height,
        marginTop: token.marginLG,
      }}
    >
      <div
        ref={bar}
        className={css`
          position: fixed;
          bottom: 0;
          z-index: 10;
          padding: ${token.paddingSM}px ${token.padding}px;
          background: ${token.colorBgContainer};
          border-top: 1px solid ${token.colorBorderSecondary};
        `}
        data-cy="eventform-footer"
        style={{ left: box.left, width: box.width }}
      >
        {formError && (
          <ErrorAlert
            error={formError}
            message={
              type === "create"
                ? t("errors.eventCreateFailed")
                : t("errors.eventUpdateFailed")
            }
            style={{ marginBottom: token.marginSM }}
          />
        )}
        {submitErrors && submitErrors.length > 0 && (
          <Alert
            data-cy="eventform-footer-submit-errors"
            description={
              <ul style={{ margin: 0, paddingLeft: token.paddingLG }}>
                {submitErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            }
            message={
              type === "create"
                ? t("errors.eventCreateFailed")
                : t("errors.eventUpdateFailed")
            }
            style={{ marginBottom: token.marginSM }}
            type="error"
            showIcon
          />
        )}
        <div
          className={css`
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: ${token.marginSM}px;
          `}
        >
          <Space wrap>
            <Button
              data-cy="eventform-button-previous-tab"
              disabled={!previous}
              icon={<LeftOutlined />}
              onClick={() => previous && setActiveTab(previous.key)}
            >
              {previous?.label}
            </Button>
            <Button
              data-cy="eventform-button-next-tab"
              disabled={!next}
              icon={<RightOutlined />}
              iconPosition="end"
              onClick={() => next && setActiveTab(next.key)}
            >
              {next?.label}
            </Button>
          </Space>
          <Space size="middle" wrap>
            <Space>
              <Form.Item name="isDraft" valuePropName="checked" noStyle>
                <Switch
                  data-cy="eventform-switch-save-as-draft"
                  defaultChecked={isDraft}
                  id="eventform-switch-save-as-draft"
                  onChange={(checked) => setIsDraft(checked)}
                />
              </Form.Item>
              <label htmlFor="eventform-switch-save-as-draft">
                {t("forms.saveAsDraft")}
              </label>
            </Space>
            {!canSubmit && (
              // Hovering the hint lists what is still missing, on any tab
              <Tooltip
                title={
                  missingFields?.length ? (
                    <ul
                      data-cy="eventform-footer-missing-fields"
                      style={{ margin: 0, paddingLeft: token.paddingMD }}
                    >
                      {missingFields.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null
                }
              >
                <Typography.Text
                  data-cy="eventform-footer-fill-required"
                  style={{ cursor: "help", textDecoration: "underline dotted" }}
                  type="secondary"
                >
                  {t("forms.fillRequiredToSave")}
                </Typography.Text>
              </Tooltip>
            )}
            <Button
              data-cy="eventform-button-submit"
              disabled={!canSubmit}
              htmlType="submit"
              loading={formSubmitting}
              type="primary"
            >
              {t(`common:${type}`)}
            </Button>
          </Space>
        </div>
      </div>
    </div>
  )
}
