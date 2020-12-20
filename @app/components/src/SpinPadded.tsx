import Spin, { SpinProps } from "antd/lib/spin";
import React from "react";

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
