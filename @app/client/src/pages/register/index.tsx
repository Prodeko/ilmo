import React from "react";
import { Redirect } from "@app/components";
import { NextPage } from "next";

const R: NextPage = () => <Redirect layout href={"/"} />;

export default R;
