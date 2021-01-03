import React, { CSSProperties, useEffect, useState } from "react";
import { green, orange, red } from "@ant-design/colors";

interface Props {
  completed: number;
}

export const ProgressBar = ({ completed }: Props) => {
  const [color, setColor] = useState(green[6]);

  useEffect(() => {
    if (completed >= 100) {
      setColor(red[7]);
    } else if (completed >= 75) {
      setColor(orange[6]);
    }
  }, [completed]);

  const containerStyles: CSSProperties = {
    height: 20,
    width: "100%",
    display: "flex",
    alignItems: "center",
    margin: "5px 0",
  };

  const progressBackgroundStyles: CSSProperties = {
    height: 20,
    width: "100%",
    backgroundColor: "#e0e0de",
    position: "relative",
  };

  const fillerStyles: CSSProperties = {
    height: "100%",
    width: `${completed > 100 ? 100 : completed.toString()}%`,
    backgroundColor: color,
  };

  const labelStyles: CSSProperties = {
    flexShrink: 0,
    width: "4ch",
    textAlign: "right",
  };

  return (
    <div style={containerStyles}>
      <div style={progressBackgroundStyles}>
        <div style={fillerStyles}></div>
      </div>
      <span style={labelStyles}>{`${completed.toString()}%`}</span>
    </div>
  );
};
