import React from "react";
import { QueryResult } from "@apollo/client";
import { AdminCategory_QueryFragment } from "@app/graphql";
import { Col, Row } from "antd";
import { useRouter } from "next/router";

import { Loading } from "./Loading";
import { ErrorAlert, FourOhFour } from "./";

export function useAdminCategoryId() {
  const router = useRouter();
  const { id: rawId } = router.query;
  return String(rawId);
}

export function useAdminCategoryLoading(
  query: Pick<
    QueryResult<AdminCategory_QueryFragment>,
    "data" | "loading" | "error" | "networkStatus" | "client" | "refetch"
  >
) {
  const { data, loading, error } = query;

  let child: JSX.Element | null = null;
  const category = data?.eventCategory;
  if (category) {
    //child = <OrganizationPageInner organization={organization} />;
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
