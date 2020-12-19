import { NextPage } from "next";
import Router from "next/router";
import React, { useEffect } from "react";

const Event: NextPage = () => {
  useEffect(() => {
    Router.replace("/");
  }, []);
  return <div>Redirecting...</div>;
};

export default Event;
