import React from "react";
import { QueryResult } from "@apollo/client";
import { EventPage_QueryFragment } from "@app/graphql";
import { Col, Row } from "antd";
import { useRouter } from "next/router";

import { Loading } from "./Loading";
import { ErrorAlert, FourOhFour } from "./";

export function useEventSlug() {
  const router = useRouter();
  const { slug: rawSlug } = router.query;
  return String(rawSlug);
}

export function useEventLoading(
  query: Pick<
    QueryResult<EventPage_QueryFragment>,
    "data" | "loading" | "error" | "networkStatus" | "client" | "refetch"
  >
) {
  const { data, loading, error } = query;

  let child: JSX.Element | null = null;
  const event = data?.eventBySlug;
  if (event) {
  } else if (loading) {
    child = <Loading />;
  } else if (error) {
    child = <ErrorAlert error={error} />;
  } else {
    // TODO: 404
    child = <FourOhFour currentUser={data?.currentUser} />;
  }

  return (
    child && (
      <Row>
        <Col flex={1}>{child}</Col>
      </Row>
    )
  );
}
