import React, { useCallback, useState } from "react"
import { DocumentNode, useQuery } from "@apollo/client"
import { Sorter, ValueOf } from "@app/lib"
import { Table } from "antd"
import { ColumnsType, TablePaginationConfig, TableProps } from "antd/lib/table"
import { get } from "lodash"

import { ErrorAlert } from "./ErrorAlert"
import { Loading } from "./Loading"

type RecordType = any

interface CustomColumnType extends ColumnsType {
  sorter: {
    compare: ValueOf<typeof Sorter>
  }
  dataIndex: string | string[]
}

interface Props extends TableProps<RecordType> {
  queryDocument: DocumentNode
  variables?: Record<string, any>
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
        // to display with this component. Otherwise pagination won't
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


  // See @app/client/src/pages/index.tsx and @app/lib/src/utils to understand
  // how our table sorting setup works.
  const sortableColumns =
    (columns?.map((column) => {
      const { sorter, dataIndex, ...otherColumnProps } =
        column as CustomColumnType

      if (sorter) {
        const { compare, ...otherSorterProps } = sorter

        return {
          ...otherColumnProps,
          dataIndex,
          sorter: {
            compare: (rowA: RecordType, rowB: RecordType) => {
              // @ts-ignore
              return compare(get(rowA, dataIndex), get(rowB, dataIndex))
            },
            ...otherSorterProps,
          },
        }
      }

      return column
    }) as ColumnsType<RecordType>) || []

  return error ? (
    <ErrorAlert error={error} />
  ) : (
    <Table
      columns={sortableColumns}
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
