import qs from "querystring"

import { useCallback, useState } from "react"
import {
  AuthRestrict,
  ButtonLink,
  ErrorResult,
  Loading,
  Redirect,
  SharedLayout,
} from "@app/components"
import {
  InvitationDetailQuery,
  SharedLayout_UserFragment,
  useAcceptOrganizationInviteMutation,
  useInvitationDetailQuery,
} from "@app/graphql"
import { getCodeFromError } from "@app/lib"
import { Button, Col, Result, Row, Skeleton } from "antd"
import { GetServerSideProps, NextPage } from "next"
import Router, { useRouter } from "next/router"
import useTranslation from "next-translate/useTranslation"
import { UseQueryState } from "urql"

interface Props {
  id: string | null
  code: string | null
}

enum Status {
  PENDING = "PENDING",
  ACCEPTING = "ACCEPTING",
}

const InvitationAccept: NextPage<Props> = (props) => {
  const { t } = useTranslation("invitations")
  const router = useRouter()
  const fullHref =
    router.pathname + (router?.query ? `?${qs.stringify(router.query)}` : "")
  const { id: rawId, code } = props
  const id = rawId || ""

  const [query] = useInvitationDetailQuery({
    variables: {
      id,
      code,
    },
    pause: !id,
    requestPolicy: "network-only",
  })

  return (
    <SharedLayout
      forbidWhen={AuthRestrict.LOGGED_OUT}
      query={query}
      title={t("acceptInvitation")}
      noHandleErrors
    >
      {({ currentUser, error, fetching }) =>
        !currentUser && !error && !fetching ? (
          <Redirect href={`/login?next=${encodeURIComponent(fullHref)}`} />
        ) : (
          <Row>
            <Col flex={1}>
              <InvitationAcceptInner
                code={code}
                currentUser={currentUser}
                id={id}
                query={query}
              />
            </Col>
          </Row>
        )
      }
    </SharedLayout>
  )
}

interface InvitationAcceptInnerProps extends Props {
  currentUser?: SharedLayout_UserFragment | null
  query: UseQueryState<InvitationDetailQuery>
}

const InvitationAcceptInner: React.FC<InvitationAcceptInnerProps> = (props) => {
  const { id, code, query } = props
  const { t } = useTranslation("accept")
  const router = useRouter()

  const { data, fetching, error } = query
  const [, acceptInvite] = useAcceptOrganizationInviteMutation()

  const [status, setStatus] = useState(Status.PENDING)
  const [acceptError, setAcceptError] = useState<Error | null>(null)

  const organization = data?.organizationForInvitation
  const handleAccept = useCallback(() => {
    if (!organization) {
      return
    }
    setStatus(Status.ACCEPTING)
    // Call mutation
    acceptInvite({
      id,
      code,
    }).then(
      () => {
        // Redirect
        Router.push(
          `/admin/organization/[slug]`,
          `/admin/organization/${organization.slug}`
        )
      },
      (e) => {
        setStatus(Status.PENDING)
        setAcceptError(e)
      }
    )
  }, [acceptInvite, code, id, organization])

  let child: JSX.Element | null = null
  if (status === Status.ACCEPTING) {
    child = <Loading />
  } else if (error || acceptError) {
    const code = getCodeFromError(error || acceptError)
    if (code === "NTFND") {
      child = (
        <Result
          status="404"
          subTitle={t("result.ntfnd.subTitle")}
          title={t("result.ntfnd.title")}
        />
      )
    } else if (code === "DNIED") {
      child = (
        <Result
          status="403"
          subTitle={t("result.dnied.subTitle")}
          title={t("result.dnied.title")}
        />
      )
    } else if (code === "LOGIN") {
      child = (
        <Result
          extra={
            <ButtonLink
              href={`/login?next=${encodeURIComponent(router.asPath)}`}
            >
              {t("common:login")}
            </ButtonLink>
          }
          status="403"
          title={t("result.login.title")}
        />
      )
    } else {
      child = <ErrorResult error={error || acceptError!} />
    }
  } else if (organization) {
    child = (
      <Result
        extra={
          <Button type="primary" onClick={handleAccept}>
            {t("acceptInvitation")}
          </Button>
        }
        status="success"
        title={t("result.success.title", { organization: organization.name })}
      />
    )
  } else if (fetching) {
    child = <Skeleton />
  } else {
    child = (
      <Result
        status="error"
        subTitle={t("result.error.subtitle")}
        title={t("common:unknownError")}
      />
    )
  }
  return child
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { query } = context
  const { id, code } = query
  return {
    props: {
      id: typeof id === "string" ? id : null,
      code: typeof code === "string" ? code : null,
    },
  }
}

export default InvitationAccept
