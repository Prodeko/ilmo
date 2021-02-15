import React from "react";
import { QueryResult } from "@apollo/client";
import { OrganizationPage_QueryFragment } from "@app/graphql";
import { Col, Row } from "antd";
import { useRouter } from "next/router";

import { ErrorAlert, FourOhFour, LoadingPadded } from "./";

export function useOrganizationSlug() {
  const router = useRouter();
  const { slug: rawSlug } = router.query;
  return String(rawSlug);
}

export function useOrganizationLoading(
  query: Pick<
    QueryResult<OrganizationPage_QueryFragment>,
    "data" | "loading" | "error" | "networkStatus" | "client" | "refetch"
  >
) {
  const { data, loading, error } = query;

  let child: JSX.Element | null = null;
  const organization = data?.organizationBySlug;
  if (organization) {
  } else if (loading) {
    child = <LoadingPadded size="large" />;
  } else if (error) {
    child = <ErrorAlert error={error} />;
  } else {
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
