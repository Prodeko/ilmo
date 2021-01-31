import React from "react";
import { Table } from "antd";
import { TableProps } from "antd/lib/table";

interface Props extends TableProps<any> {
  data?: any;
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
