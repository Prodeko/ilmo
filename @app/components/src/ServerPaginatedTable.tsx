import { useCallback, useEffect, useRef, useState } from "react"
import CsvDownloader from "react-csv-downloader"
import { Sorter, ValueOf } from "@app/lib"
import { Button, Table } from "antd"
import get from "lodash/get"
import { useQuery } from "urql"

import { ErrorResult } from "./ErrorResult"
import { Loading } from "./Loading"
import { useIsMobile, useTranslation } from "."

import type { SizeType } from "antd/lib/config-provider/SizeContext"
import type {
  ColumnsType,
  ColumnType,
  TablePaginationConfig,
  TableProps,
} from "antd/lib/table"
import type { DocumentNode } from "graphql"

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
  showSizeChanger?: boolean
  size?: SizeType
}

const DEFAULT_PAGE_SIZE = 10

export function ServerPaginatedTable({
  columns,
  dataField,
  queryDocument,
  variables,
  downloadFunction,
  downloadFilename = "data.csv",
  showDownload = false,
  showPagination = true,
  showSizeChanger = false,
  size,
  ...props
}: ServerPaginatedTableProps) {
  const isMobile = useIsMobile()
  const { t } = useTranslation("common")
  const downloadRef = useRef<HTMLButtonElement>(null)
  const [disableDownload, setDisableDownload] = useState(true)
  const [first, setFirst] = useState(DEFAULT_PAGE_SIZE)
  const [offset, setOffset] = useState(0)
  const [{ error, fetching, data }] = useQuery<
    typeof queryDocument,
    typeof variables
  >({
    query: queryDocument,
    variables: {
      ...variables,
      // Pagination can be empty if table contains less
      // than DEFAULT_PAGE_SIZE elements
      first,
      offset,
    },
  })

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: data?.[dataField]?.totalCount || 0,
    showSizeChanger,
    showTotal: showSizeChanger
      ? (total) => `${t("common:total")}: ${total}`
      : undefined,
  })

  const dataSource = get(data, `${dataField}.nodes`, [])

  const downloadTableData = useCallback(async () => {
    // Workaround for fething all data in the table before
    // downloading it as csv. Otherwise we would only download
    // what is displayed initially. The useEffect below is also
    // used to achieve the desired effect here.
    setFirst(pagination?.total || 999)
    setOffset(0)
    setDisableDownload(false)
  }, [pagination])

  useEffect(() => {
    if (!disableDownload && !fetching) {
      // @ts-ignore
      downloadRef.current?.handleClick()
      setDisableDownload(true)
    }
  }, [disableDownload, downloadRef, fetching])

  useEffect(() => {
    // Set pagination totalCount after data has loaded
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
    setFirst(pageSize)
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
          disabled={disableDownload}
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
        rowKey={(obj) => obj.id}
        scroll={{ x: 100 }}
        size={size ?? isMobile ? "small" : "middle"}
        onChange={handleTableChange}
        {...props}
      />
    </>
  )
}
