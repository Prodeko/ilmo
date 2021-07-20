import * as qs from "querystring"

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
import { NextPage } from "next"
import Router, { useRouter } from "next/router"
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
  const router = useRouter()
  const fullHref =
    router.pathname +
    (router && router.query ? `?${qs.stringify(router.query)}` : "")
  const { id: rawId, code } = props
  const id = rawId || ("" as string)

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
      title="Accept Invitation"
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
  const router = useRouter()

  const { data, fetching, error } = query
  const [_res1, acceptInvite] = useAcceptOrganizationInviteMutation()

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
          subTitle="Perhaps you have already accepted it?"
          title="That invitation could not be found"
        />
      )
    } else if (code === "DNIED") {
      child = (
        <Result
          status="403"
          subTitle="Perhaps you should log out and log in with a different account?"
          title="That invitation is not for you"
        />
      )
    } else if (code === "LOGIN") {
      child = (
        <Result
          extra={
            <ButtonLink
              href={`/login?next=${encodeURIComponent(router.asPath)}`}
            >
              Log in
            </ButtonLink>
          }
          status="403"
          title="Log in to accept invitation"
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
            Accept invitation
          </Button>
        }
        status="success"
        title={`You were invited to ${organization.name}`}
      />
    )
  } else if (fetching) {
    child = <Skeleton />
  } else {
    child = (
      <Result
        status="error"
        subTitle="We couldn't find details about this invite, please try again later"
        title="Something went wrong"
      />
    )
  }
  return child
}

InvitationAccept.getInitialProps = async ({ query: { id, code } }) => ({
  id: typeof id === "string" ? id : null,
  code: typeof code === "string" ? code : null,
})

export default InvitationAccept
