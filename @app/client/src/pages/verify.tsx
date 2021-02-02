import React, { useEffect, useState } from "react";
import { Col, Row, SharedLayout } from "@app/components";
import { useSharedQuery, useVerifyEmailMutation } from "@app/graphql";
import { Alert } from "antd";
import { get } from "lodash";
import { NextPage } from "next";

interface Props {
  id: string | null;
  token: string | null;
}

const VerifyPage: NextPage<Props> = (props) => {
  const [[id, token], setIdAndToken] = useState<[string, string]>([
    props.id || "",
    props.token || "",
  ]);
  const [state, setState] = useState<"PENDING" | "SUBMITTING" | "SUCCESS">(
    props.id && props.token ? "SUBMITTING" : "PENDING"
  );
  const [error, setError] = useState<Error | null>(null);
  const [verifyEmail] = useVerifyEmailMutation();

  useEffect(() => {
    if (state === "SUBMITTING") {
      setError(null);
      verifyEmail({
        variables: {
          id,
          token,
        },
      })
        .then((result) => {
          if (get(result, "data.verifyEmail.success")) {
            setState("SUCCESS");
          } else {
            setState("PENDING");
            setError(new Error("Incorrect token, please check and try again"));
          }
        })
        .catch((e: Error) => {
          setError(e);
          setState("PENDING");
        });
    }
  }, [id, token, state, props, verifyEmail]);

  function form() {
    return (
      <form onSubmit={() => setState("SUBMITTING")}>
        <p>Please enter your email verification code</p>
        <input
          type="text"
          value={token}
          onChange={(e) => setIdAndToken([id, e.target.value])}
        />
        {error && <p>{error.message || error}</p>}
        <button>Submit</button>
      </form>
    );
  }

  const query = useSharedQuery();

  return (
    <SharedLayout title="Verify Email Address" query={query}>
      <Row>
        <Col flex={1}>
          {state === "PENDING" ? (
            form()
          ) : state === "SUBMITTING" ? (
            "Submitting..."
          ) : state === "SUCCESS" ? (
            <Alert
              type="success"
              showIcon
              message="Email Verified"
              description="Thank you for verifying your email address. You may now close this window."
            />
          ) : (
            "Unknown state"
          )}
        </Col>
      </Row>
    </SharedLayout>
  );
};

VerifyPage.getInitialProps = async ({ query: { id, token } }) => ({
  id: typeof id === "string" ? id : null,
  token: typeof token === "string" ? token : null,
});

export default VerifyPage;
