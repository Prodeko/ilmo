import React from "react";
import Spin, { SpinProps } from "antd/lib/spin";

export const SpinPadded: React.FC<SpinProps> = (props) => (
  <div
    style={{
      padding: "2rem",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Spin {...props} />
  </div>
);
