import { useCallback, useEffect, useRef, useState } from "react"
import CsvDownloader from "react-csv-downloader"
import { Sorter, ValueOf } from "@app/lib"
import { Button, Table } from "antd"
import { SizeType } from "antd/lib/config-provider/SizeContext"
import {
  ColumnsType,
  ColumnType,
  TablePaginationConfig,
  TableProps,
} from "antd/lib/table"
import { DocumentNode } from "graphql"
import get from "lodash/get"
import useTranslation from "next-translate/useTranslation"
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
  downloadFunction?: (data) => Array<Record<string, any>>
  downloadFilename?: string
  showDownload?: boolean
  showPagination?: boolean
  size?: SizeType
}

export function ServerPaginatedTable({
  columns,
  dataField,
  queryDocument,
  variables,
  downloadFunction,
  downloadFilename = "data.csv",
  showDownload = false,
  showPagination = true,
  size,
  ...props
}: ServerPaginatedTableProps) {
  const isMobile = useIsMobile()
  const { t } = useTranslation("common")
  const downloadRef = useRef<HTMLButtonElement>(null)
  const [downloadData, setDownloadData] = useState(false)
  const [first, setFirst] = useState(10)
  const [offset, setOffset] = useState(0)
  const [{ error, fetching, data }] = useQuery<
    typeof queryDocument,
    typeof variables
  >({
    query: queryDocument,
    variables: {
      ...variables,
      // Pagination can be empty if table contains less than 10 elements
      first,
      offset,
    },
  })
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: data?.[dataField]?.totalCount || 0,
  })
  const dataSource = get(data, `${dataField}.nodes`, [])

  const downloadTableData = useCallback(async () => {
    setFirst(999)
    setOffset(0)
    setDownloadData(true)
  }, [])

  useEffect(() => {
    if (downloadData && !fetching) {
      // @ts-ignore
      downloadRef.current?.handleClick()
      setDownloadData(false)
    }
  }, [downloadData, fetching])

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
    <>
      {showDownload && (
        <CsvDownloader
          // @ts-ignore
          ref={downloadRef}
          datas={
            typeof downloadFunction === "function"
              ? downloadFunction(dataSource)
              : dataSource
          }
          disabled={downloadData}
          filename={downloadFilename}
          separator=";"
        >
          <div style={{ marginBottom: 16 }}>
            <Button data-cy="button-download-csv" onClick={downloadTableData}>
              {t("download")}
            </Button>
          </div>
        </CsvDownloader>
      )}
      <Table
        columns={transformedColumns as ColumnsType<object>}
        dataSource={dataSource}
        loading={fetching && { indicator: <Loading /> }}
        pagination={showPagination && pagination}
        // @ts-ignore
        rowKey={(obj) => obj.id}
        scroll={{ x: 100 }}
        size={size ?? isMobile ? "small" : "middle"}
        onChange={handleTableChange}
        {...props}
      />
    </>
  )
}
