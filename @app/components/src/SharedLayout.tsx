import React, { useCallback } from "react"
import { DownOutlined } from "@ant-design/icons"
import { orgName, projectName } from "@app/config"
import {
  SharedLayout_QueryFragment,
  SharedLayout_UserFragment,
  useCurrentUserUpdatedSubscription,
  useLogoutMutation,
} from "@app/graphql"
import {
  Avatar,
  Col,
  Dropdown,
  Grid,
  Layout,
  Menu,
  message,
  Row,
  Space,
  Typography,
} from "antd"
import Head from "next/head"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import { CombinedError, UseQueryState } from "urql"

import headerLogo from "../assets/header-logo.png"

import {
  ErrorResult,
  H3,
  LocaleSelect,
  Redirect,
  StandardWidth,
  useIlmoContext,
  useIsMobile,
  useTranslation,
  Warn,
} from "."

const { Header, Content, Footer } = Layout
const { Text } = Typography

export { Link }
export const { useBreakpoint } = Grid

export const contentMinHeight = "calc(100vh - 64px - 70px)"
export const contentMaxWidth = "75rem"

export interface SharedLayoutChildProps {
  error?: CombinedError | Error
  stale?: boolean
  fetching: boolean
  currentUser?: SharedLayout_UserFragment | null
}

export enum AuthRestrict {
  NEVER = 0,
  LOGGED_OUT = 1 << 0,
  LOGGED_IN = 1 << 1,
  NOT_ADMIN = 1 << 2,
}

export interface SharedLayoutProps {
  /*
   * We're expecting lots of different queries to be passed through here, and
   * for them to have this common required data we need. Methods like
   * `subscribeToMore` are too specific (and we don't need them) so we're going
   * to drop them from the data requirements.
   *
   * NOTE: we're not fetching this query internally because we want the entire
   * page to be fetchable via a single GraphQL query, rather than multiple
   * chained queries.
   */
  query: UseQueryState<SharedLayout_QueryFragment>

  title: string
  titleHref?: string
  titleHrefAs?: string
  children:
  | React.ReactNode
  | ((props: SharedLayoutChildProps) => React.ReactNode)
  noPad?: boolean
  noHandleErrors?: boolean
  forbidWhen?: AuthRestrict
  sider?: React.ReactNode
  displayFooter?: boolean
}

export function SharedLayout({
  title,
  titleHref,
  titleHrefAs,
  noPad = false,
  noHandleErrors = false,
  query,
  forbidWhen = AuthRestrict.NEVER,
  sider,
  children,
  displayFooter = true,
}: SharedLayoutProps) {
  const router = useRouter()
  const currentUrl = router?.asPath
  const [, logout] = useLogoutMutation()
  const { t } = useTranslation("common")
  const isMobile = useIsMobile()
  const context = useIlmoContext()

  const forbidsLoggedIn = forbidWhen & AuthRestrict.LOGGED_IN
  const forbidsLoggedOut = forbidWhen & AuthRestrict.LOGGED_OUT
  const forbidsNotAdmin = forbidWhen & AuthRestrict.NOT_ADMIN

  const isSSR = typeof window === "undefined"

  const handleLogout = useCallback(() => {
    const reset = async () => {
      router.events.off("routeChangeComplete", reset)
      try {
        await logout({})
        context.resetUrqlClient()
      } catch (e) {
        // Something went wrong; redirect to /logout to force logout.
        window.location.href = "/logout"
      }
    }
    router.events.on("routeChangeComplete", reset)
    router.push("/")
  }, [logout, context, router])

  const renderChildren = (props: SharedLayoutChildProps) => {
    const { error, fetching, stale } = props
    const inner =
      error && !fetching && !stale && !noHandleErrors ? (
        <ErrorResult error={error} />
      ) : typeof children === "function" ? (
        children(props)
      ) : (
        children
      )

    if (
      data &&
      data.currentUser &&
      (forbidsLoggedIn || (forbidsNotAdmin && !data.currentUser.isAdmin))
    ) {
      if (!isSSR && !noHandleErrors) {
        // Antd messages don't work with SSR
        message.error({
          key: "access-denied",
          content: `${t("error:accessDenied")}`,
        })
      }
      return <Redirect href="/" />
    } else if (
      data?.currentUser === null &&
      !fetching &&
      !error &&
      forbidsLoggedOut
    ) {
      return (
        <Redirect href={`/login?next=${encodeURIComponent(router.asPath)}`} />
      )
    }

    return <StandardWidth noPad={noPad}>{inner}</StandardWidth>
  }

  const { data, fetching, error, stale } = query

  /*
   * This will set up a GraphQL subscription monitoring for changes to the
   * current user. Interestingly we don't need to actually _do_ anything - no
   * rendering or similar - because the payload of this mutation will
   * automatically update Urql's cache which will cause the data to be
   * re-rendered wherever appropriate.
   */
  useCurrentUserUpdatedSubscription({
    // Skip checking for changes to the current user if
    // current user does not exist
    pause: !data?.currentUser,
  })

  return (
    <Layout>
      <Header
        style={{
          boxShadow: "0 2px 8px #f0f1f2",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        <Head>
          <title>{title ? `${title} — ${projectName}` : projectName}</title>
        </Head>
        <Row wrap={false}>
          <Col sm={8} style={{ padding: "5px 0" }} xs={12}>
            <Link href="/">

              <Image
                alt="Prodeko"
                height={50}
                placeholder="blur"
                src={headerLogo}
                width={50}
                priority
              />

            </Link>
          </Col>
          {!isMobile ? (
            <Col span={8}>
              <H3
                data-cy="layout-header-title"
                style={{
                  margin: 0,
                  padding: 0,
                  textAlign: "center",
                  lineHeight: "64px",
                }}
              >
                {titleHref ? (
                  <Link as={titleHrefAs} data-cy="layout-header-titlelink" href={titleHref}>
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </H3>
            </Col>
          ) : null}
          <Col sm={8} style={{ textAlign: "right" }} xs={12}>
            <Space size="large">
              <LocaleSelect />
              {data && data.currentUser ? (
                <Dropdown
                  overlay={
                    <Menu>
                      {data.currentUser.isAdmin && (
                        <Menu.Item key="admin">
                          <Link data-cy="layout-link-admin" href="/admin/event/list">
                            {t("admin")}
                          </Link>
                        </Menu.Item>
                      )}
                      <Menu.Item key="settings">
                        <Link data-cy="layout-link-settings" href="/settings/profile">

                          <Warn okay={data.currentUser.isVerified}>
                            {t("settings")}
                          </Warn>

                        </Link>
                      </Menu.Item>
                      <Menu.Item key="logout">
                        <a onClick={handleLogout}>{t("logout")}</a>
                      </Menu.Item>
                    </Menu>
                  }
                  trigger={["click"]}
                >
                  <span
                    data-cy="layout-dropdown-user"
                    style={{ whiteSpace: "nowrap", marginRight: 12 }}
                  >
                    <Avatar>{data?.currentUser?.name?.[0] || "?"}</Avatar>
                    <Warn okay={data.currentUser.isVerified}>
                      <span style={{ marginLeft: 8, marginRight: 8 }}>
                        {data.currentUser.name}
                      </span>
                      <DownOutlined
                        style={{ fontSize: 10, verticalAlign: "baseline" }}
                      />
                    </Warn>
                  </span>
                </Dropdown>
              ) : forbidsLoggedIn ? null : (
                <Link
                  data-cy="header-login-button"
                  href={`/login?next=${encodeURIComponent(currentUrl)}`}>
                  {t("signin")}
                </Link>
              )}
            </Space>
          </Col>
        </Row>
      </Header>
      <Layout hasSider={!!sider}>
        {sider ? sider : null}
        <Content style={{ minHeight: contentMinHeight }}>
          {renderChildren({
            error,
            stale,
            fetching,
            currentUser: data?.currentUser,
          })}
        </Content>
      </Layout>

      {displayFooter && (
        <Footer>
          <StandardWidth>
            <Row justify="space-between">
              <Col span={12}>
                <Text>
                  &copy; {new Date().getFullYear()} {orgName}{" "}
                </Text>
              </Col>
              {process.env.PRIVACY_URL && (
                <Col span={12} style={{ textAlign: "right" }}>
                  <Text>
                    <span>
                      <a
                        href={process.env.PRIVACY_URL}
                        style={{ textDecoration: "underline" }}
                      >
                        {t("privacyPolicy")}
                      </a>
                    </span>
                  </Text>
                </Col>
              )}
            </Row>
          </StandardWidth>
        </Footer>
      )}
    </Layout>
  );
}
