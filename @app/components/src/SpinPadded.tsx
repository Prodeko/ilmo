import React from "react";

import { Loading } from "./Loading";

export const SpinPadded: React.FC = () => (
  <div
    style={{
      padding: "2rem",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Loading />
  </div>
);
