import React, { useState } from "react";
import InboxOutlined from "@ant-design/icons/InboxOutlined";
import PictureOutlined from "@ant-design/icons/PictureOutlined";
import { Upload } from "antd";
import { UploadFile } from "antd/lib/upload/interface";
import ImgCrop from "antd-img-crop";
import useTranslation from "next-translate/useTranslation";

import "antd/lib/modal/style";
import "antd/lib/slider/style";

const { Dragger } = Upload;

interface FileUploadProps {
  accept: string;
  cropAspect: number;
  maxCount?: number;
}

export function FileUpload(props: FileUploadProps) {
  const { accept, cropAspect, maxCount } = props;
  const { t } = useTranslation();

  const [file, setFile] = useState<UploadFile | undefined>(undefined);

  const dummyRequest = ({ onSuccess }: any) => {
    setTimeout(() => {
      onSuccess("ok");
    }, 0);
  };

  const handleOnChange = ({ file }: { file: UploadFile }) => {
    setFile(file);
  };

  return (
    <ImgCrop aspect={cropAspect}>
      <Dragger
        customRequest={dummyRequest}
        fileList={file ? [file] : undefined}
        listType="picture-card"
        maxCount={maxCount}
        onChange={handleOnChange}
        {...props}
      >
        <p className="ant-upload-drag-icon">
          {accept.startsWith("image") ? <PictureOutlined /> : <InboxOutlined />}
        </p>
        <p className="ant-upload-text">{t("common:dragToUpload")}</p>
      </Dragger>
    </ImgCrop>
  );
}
