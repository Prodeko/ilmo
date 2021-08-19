import { useCallback, useEffect, useState } from "react"
import { Sorter, ValueOf } from "@app/lib"
import { Table } from "antd"
import {
  ColumnsType,
  ColumnType,
  TablePaginationConfig,
  TableProps,
} from "antd/lib/table"
import { DocumentNode } from "graphql"
import { get } from "lodash"
import { useQuery } from "urql"

import { ErrorResult } from "./ErrorResult"
import { Loading } from "./Loading"
import { useIsMobile } from "."

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
  const isMobile = useIsMobile()
  const [offset, setOffset] = useState(0)
  const [{ error, fetching, data }] = useQuery<
    typeof queryDocument,
    typeof variables
  >({
    query: queryDocument,
    variables: {
      ...variables,
      // Pagination can be empty if table contains less than 10 elements
      first: 10,
      offset: offset,
    },
  })
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: data?.[dataField]?.totalCount || 0,
  })

  useEffect(() => {
    const total = data?.[dataField]?.totalCount
    if (total) {
      setPagination((prev) => ({ ...prev, total }))
    }
  }, [data, dataField])

  const handleTableChange = useCallback(async (pagination) => {
    const { current, pageSize } = pagination
    const newOffset = (current - 1) * pageSize || 0
    setPagination({ ...pagination })
    setOffset(newOffset)
  }, [])

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
    <ErrorResult error={error} />
  ) : (
    <Table
      columns={transformedColumns as ColumnsType<object>}
      dataSource={get(data, dataField)?.nodes || []}
      loading={fetching && { indicator: <Loading /> }}
      pagination={showPagination && pagination}
      rowKey={(obj) => obj.id}
      scroll={{ x: 100 }}
      size={isMobile ? "small" : "middle"}
      onChange={handleTableChange}
      {...props}
    />
  )
}
