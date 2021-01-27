import React from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";

const loadingIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;
export const Loading = () => <Spin indicator={loadingIcon} />;
