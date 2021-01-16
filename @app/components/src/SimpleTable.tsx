import React from "react";
import { Table } from "antd";
import { ColumnsType } from "antd/lib/table";

interface Props {
  data?: any;
  columns: ColumnsType<any>;
}

export function SimpleTable({ data, columns, ...props }: Props) {
  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey={(obj) => obj.id}
      rowClassName={(record, _index) =>
        record?.isHighlighted ? "table-row-highlight" : ""
      }
      {...props}
    />
  );
}
