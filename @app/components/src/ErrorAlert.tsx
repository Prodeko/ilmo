import React from "react";
import SyncOutlined from "@ant-design/icons/SyncOutlined";
import { ApolloError } from "@apollo/client";
import { Alert, Button, Result } from "antd";
import Paragraph from "antd/lib/typography/Paragraph";

export interface ErrorAlertProps {
  error: ApolloError | Error;
}

export function ErrorAlert({ error }: ErrorAlertProps) {
  const code: string | undefined = (error as any)?.networkError?.result
    ?.errors?.[0]?.code;
  if (code === "EBADCSRFTOKEN") {
    return (
      <Result
        status="403"
        subTitle={
          <>
            <Paragraph type="secondary">
              Our security protections have failed to authenticate your request;
              to solve this you need to refresh the page:
            </Paragraph>
            <Paragraph>
              <Button
                icon={<SyncOutlined />}
                type="primary"
                onClick={() => window.location.reload()}
              >
                Refresh page
              </Button>
            </Paragraph>
          </>
        }
        title="Invalid CSRF token"
      />
    );
  }
  return (
    <Result
      status="error"
      subTitle={
        <span>
          We're really sorry, but an unexpected error occurred. Please{" "}
          <a href="/">return to the homepage</a> and try again.
        </span>
      }
      title="Unexpected error occurred"
    >
      <Alert message={error.message} type="error" />
    </Result>
  );
}
