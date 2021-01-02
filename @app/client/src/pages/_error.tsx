import * as React from "react";
import { ErrorOccurred, FourOhFour, SharedLayout } from "@app/components";
import { useSharedQuery } from "@app/graphql";
import { Col, Row } from "antd";
import { NextPage } from "next";
import { Translate } from "next-translate";
import useTranslation from "next-translate/useTranslation";

const isDev = process.env.NODE_ENV !== "production";
interface ErrorPageProps {
  statusCode: number | null;
  pathname: string | null;
}

interface ErrorComponentSpec<TProps> {
  title: string;
  Component: React.FC<TProps>;
  props?: TProps;
}

interface GetDisplayErrorProps extends ErrorPageProps {
  t: Translate;
}

const getDisplayForError = (
  props: GetDisplayErrorProps
): ErrorComponentSpec<any> => {
  const { statusCode, pathname, t } = props;

  switch (statusCode) {
    case 404:
      return {
        Component: FourOhFour,
        title: t("pageNotFound"),
      };
    default:
      return {
        Component: ErrorOccurred,
        title: t("errorOccurred"),
      };
  }
};

const ErrorPage: NextPage<ErrorPageProps> = (props) => {
  const { t } = useTranslation("error");
  const { Component, title, props: componentProps } = getDisplayForError({
    ...props,
    t,
  });
  const query = useSharedQuery();

  return (
    <SharedLayout title={title} query={query}>
      <Row>
        <Col flex={1}>
          <Component {...componentProps} />
        </Col>
      </Row>
    </SharedLayout>
  );
};

ErrorPage.getInitialProps = async ({ res, err, asPath }) => ({
  pathname: asPath || null,
  statusCode: res ? res.statusCode : err ? err["statusCode"] || null : null,
});

export default ErrorPage;
