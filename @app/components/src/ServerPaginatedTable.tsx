import React, { useCallback, useState } from "react"
import { DocumentNode, useQuery } from "@apollo/client"
import { Table } from "antd"
import { TablePaginationConfig, TableProps } from "antd/lib/table"
import { get } from "lodash"

import { ErrorAlert } from "./ErrorAlert"
import { Loading } from "./Loading"

interface Props extends TableProps<any> {
  queryDocument: DocumentNode
  variables?: any
  dataField: string
  showPagination?: boolean
}

export function ServerPaginatedTable({
  queryDocument,
  variables,
  columns,
  dataField,
  showPagination = true,
  ...props
}: Props) {
  const [offset, setOffset] = useState(0)
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
  })
  const { error, loading, data, fetchMore } = useQuery<
    typeof queryDocument,
    typeof variables
  >(queryDocument, {
    variables: {
      ...variables,
      // Pagination can be empty if table contains less than 10 elements
      first: pagination.pageSize || 10,
      offset: offset,
    },
    onCompleted: () =>
      setPagination({
        ...pagination,
        // Remember to query the totalCount field for the records you wish
        // to display with this component
        total: get(data, dataField)?.totalCount,
      }),
  })

  const handleTableChange = useCallback(
    async (pagination) => {
      setPagination({ ...pagination })
      const { current, pageSize } = pagination
      const newOffset = (current - 1) * pageSize || 0

      await fetchMore({
        variables: {
          offset: newOffset,
        },
      })
      setOffset(newOffset)
    },
    [fetchMore]
  )

  return error ? (
    <ErrorAlert error={error} />
  ) : (
    <Table
      columns={columns}
      dataSource={get(data, dataField)?.nodes || []}
      loading={loading && { indicator: <Loading /> }}
      pagination={showPagination && pagination}
      rowKey={(obj) => obj.id}
      scroll={{ x: 100 }}
      onChange={handleTableChange}
      {...props}
    />
  )
}
