import React, { CSSProperties, useEffect, useState } from "react";
import { green, orange, red } from "@ant-design/colors";

interface Props {
  percentageFilled: number;
  filled: number;
  size: number;
}

export const ProgressBar = ({ percentageFilled, size, filled }: Props) => {
  const [color, setColor] = useState(green[6]);

  useEffect(() => {
    if (percentageFilled >= 100) {
      setColor(red[6]);
    } else if (percentageFilled >= 75) {
      setColor(orange[6]);
    }
  }, [percentageFilled]);

  const containerStyles: CSSProperties = {
    height: 20,
    width: "100%",
    display: "flex",
    alignItems: "center",
    margin: "5px 0",
    position: "relative",
  };

  const progressBackgroundStyles: CSSProperties = {
    height: 20,
    width: "100%",
    backgroundColor: "#c1c1c1",
    position: "relative",
  };

  const fillerStyles: CSSProperties = {
    height: "100%",
    width: `${percentageFilled > 100 ? "100%" : percentageFilled.toString()}%`,
    backgroundColor: color,
  };

  const labelStyles: CSSProperties = {
    flexShrink: 0,
    position: "absolute",
    color: "white",
    left: 0,
    right: 0,
    marginLeft: "auto",
    marginRight: "auto",
    textAlign: "center",
    whiteSpace: "nowrap",
  };

  return (
    <div style={containerStyles}>
      <div style={progressBackgroundStyles}>
        <div style={fillerStyles}></div>
      </div>
      <span style={labelStyles}>{`${filled.toString()} / ${size}`}</span>
    </div>
  );
};
