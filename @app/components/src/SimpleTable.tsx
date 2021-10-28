import { Table } from "antd"

import { useIsMobile } from "./hooks"

import type { TableProps } from "antd/lib/table"

interface Props extends TableProps<any> {
  data?: any
}

export function SimpleTable({ data, columns, ...props }: Props) {
  const isMobile = useIsMobile()
  return (
    <Table
      columns={columns}
      dataSource={data}
      pagination={{ defaultPageSize: 10, hideOnSinglePage: true }}
      rowKey={(obj) => obj.id}
      size={isMobile ? "small" : "middle"}
      {...props}
    />
  )
}
