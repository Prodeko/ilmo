// @ts-nocheck
import React, { useCallback, useState } from "react"
import { DocumentNode, useQuery } from "@apollo/client"
import { Sorter, ValueOf } from "@app/lib"
import { Table } from "antd"
import {
  ColumnsType,
  ColumnType,
  TablePaginationConfig,
  TableProps,
} from "antd/lib/table"
import { get } from "lodash"

import { ErrorAlert } from "./ErrorAlert"
import { Loading } from "./Loading"

type RecordType = any

interface CustomColumnType extends ColumnType<RecordType> {
  sorter?: {
    compare: ValueOf<typeof Sorter>
  }
}

interface ServerPaginatedTableProps extends TableProps<RecordType> {
  columns: CustomColumnType[]
  dataField: string
  queryDocument: DocumentNode
  variables?: Record<string, any>
  showPagination?: boolean
}

export function ServerPaginatedTable({
  columns,
  dataField,
  queryDocument,
  variables,
  showPagination = true,
  ...props
}: ServerPaginatedTableProps) {
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
  // how our table sorting setup works. When the 'filters' key is specified for
  // a column, we automatically add the onFilter property to the column.
  const transformedColumns =
    columns?.map((column) => {
      const { sorter, filters, dataIndex, ...otherColumnProps } = column
      let ret = column

      if (sorter) {
        const { compare, ...otherSorterProps } = sorter

        ret = {
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

      if (filters) {
        ret = {
          ...otherColumnProps,
          filters,
          dataIndex,
          onFilter: (value: string | number | boolean, record: RecordType) =>
            get(record, dataIndex!).indexOf(value) === 0,
        }
      }

      return ret
    }) || []

  return error ? (
    <ErrorAlert error={error} />
  ) : (
    <Table
      columns={transformedColumns as ColumnsType}
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
