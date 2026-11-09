import { useEffect, useState } from "react"
import { SendOutlined } from "@ant-design/icons"
import { ErrorAlert, useTranslation } from "@app/components"
import {
  useDisconnectTelegramMutation,
  useRequestTelegramLinkMutation,
} from "@app/graphql"
import { Alert, Button, Space, Typography } from "antd"

export function TelegramConnection({
  account,
  refresh,
  botUsername,
}: {
  botUsername?: string | null
  account?: { username?: string | null } | null
  refresh: () => void
}) {
  const { t } = useTranslation("reminders")
  const [link, setLink] = useState<string>()
  const [expiresAt, setExpiresAt] = useState(0)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [request, requestLink] = useRequestTelegramLinkMutation()
  const [disconnect, disconnectTelegram] = useDisconnectTelegramMutation()
  const error = request.error || disconnect.error
  useEffect(() => {
    if (!link || account) return
    const timer = window.setInterval(() => {
      if (Date.now() >= expiresAt) window.clearInterval(timer)
      else refresh()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [link, account, expiresAt, refresh])
  if (!botUsername) return null
  const connect = async () => {
    // Open synchronously from the click so browser popup protection permits it.
    const tab = window.open("about:blank", "_blank")
    if (tab) tab.opener = null
    let opened = false
    setPopupBlocked(false)
    try {
      const result = await requestLink({})
      const token = result.data?.requestTelegramLink?.string
      if (!token) return
      const url = `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`
      setLink(url)
      setExpiresAt(Date.now() + 15 * 60 * 1000)
      if (tab && !tab.closed) {
        tab.location.href = url
        opened = true
      }
      setPopupBlocked(!opened)
    } finally {
      if (!opened && tab && !tab.closed) tab.close()
    }
  }
  return (
    <Alert
      description={
        <Space direction="vertical">
          {account && (
            <Typography.Text>
              {t("telegram.connected", {
                name: account.username ? `@${account.username}` : "Telegram",
              })}
            </Typography.Text>
          )}
          {error && <ErrorAlert error={error} />}
          {account ? (
            <Button
              loading={disconnect.fetching}
              onClick={async () => {
                const result = await disconnectTelegram({})
                if (!result.error) {
                  setLink(undefined)
                  setPopupBlocked(false)
                  refresh()
                }
              }}
            >
              {t("telegram.disconnect")}
            </Button>
          ) : (
            <Space wrap>
              {link ? (
                <>
                  <Button
                    href={link}
                    rel="noopener noreferrer"
                    target="_blank"
                    type="primary"
                  >
                    {t("telegram.open")}
                  </Button>
                  <Button loading={request.fetching} onClick={connect}>
                    {t("telegram.newLink")}
                  </Button>
                  <Button onClick={refresh}>{t("telegram.check")}</Button>
                </>
              ) : (
                <Button
                  icon={<SendOutlined />}
                  loading={request.fetching}
                  type="primary"
                  onClick={connect}
                >
                  {t("telegram.connect")}
                </Button>
              )}
            </Space>
          )}
          {!account && popupBlocked && (
            <Typography.Text>{t("telegram.popupBlocked")}</Typography.Text>
          )}
          {!account && link && (
            <Typography.Text>{t("telegram.instructions")}</Typography.Text>
          )}
        </Space>
      }
      message={t("telegram.title")}
      style={{ marginBottom: 24 }}
      type="info"
    />
  )
}
