import { useEffect, useState } from "react"
import {
  EventPage_QueryFragment,
  EventPage_RegistrationsFragment,
  OrganizationPage_QueryFragment,
  useEventRegistrationsSubscription,
} from "@app/graphql"
import { Col, Row } from "antd"
import useBreakpoint from "antd/lib/grid/hooks/useBreakpoint"
import { useRouter } from "next/router"
import { UseQueryState } from "urql"

import { ErrorResult, FourOhFour, LoadingPadded } from "./"

export function useQuerySlug() {
  const router = useRouter()
  const { slug: rawSlug } = router.query
  return String(rawSlug)
}

export function useQueryId() {
  const router = useRouter()
  const { id: rawId } = router.query
  return String(rawId)
}

export function useEventLoading(query: UseQueryState<EventPage_QueryFragment>) {
  const { data, fetching, error } = query

  let child: JSX.Element | null = null
  const event = data?.eventBySlug
  if (event) {
  } else if (fetching) {
    child = <LoadingPadded size="huge" />
  } else if (error) {
    child = <ErrorResult error={error} />
  } else {
    child = <FourOhFour currentUser={data?.currentUser} />
  }

  return (
    child && (
      <Row>
        <Col flex={1}>{child}</Col>
      </Row>
    )
  )
}

export function useOrganizationLoading(
  query: UseQueryState<OrganizationPage_QueryFragment>
) {
  const { data, fetching, error } = query

  let child: JSX.Element | null = null
  const organization = data?.organizationBySlug
  if (organization) {
  } else if (fetching) {
    child = <LoadingPadded size="large" />
  } else if (error) {
    child = <ErrorResult error={error} />
  } else {
    child = <FourOhFour currentUser={data?.currentUser} />
  }

  return (
    child && (
      <Row>
        <Col flex={1}>{child}</Col>
      </Row>
    )
  )
}

export function useEventRegistrations(
  eventId: string,
  after: string = new Date().toISOString(),
  initialRegistrations: EventPage_RegistrationsFragment[] = []
) {
  const [registrations, setRegistrations] = useState(initialRegistrations)

  useEffect(() => {
    if (initialRegistrations?.[0]) {
      setRegistrations(initialRegistrations)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEventRegistrationsSubscription(
    {
      variables: { eventId, after },
      pause: !eventId,
    },
    (prev, response) => {
      const registrations = response?.eventRegistrations
        ?.registrations as EventPage_RegistrationsFragment[]
      setRegistrations(registrations)
      return undefined as any
    }
  )

  return registrations
}

export function useIsMobile() {
  const screens = useBreakpoint()
  const isMobile = screens["xs"]
  return isMobile!
}
