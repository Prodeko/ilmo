import React, { useCallback, useState } from "react";
import { DocumentNode, useQuery } from "@apollo/client";
import { Table, Typography } from "antd";
import { ColumnsType, TablePaginationConfig } from "antd/lib/table";

const { Paragraph } = Typography;

interface Props {
  queryDocument: DocumentNode;
  variables: any;
  columns: ColumnsType<{ id: string; isHighlighted?: boolean }>;
  fieldName: string;
  showPagination?: boolean;
}

export function ServerPaginatedTable({
  queryDocument,
  variables,
  columns,
  fieldName,
  showPagination = true,
}: Props) {
  const [pageSize, _setPageSize] = useState(5);
  const [offset, setOffset] = useState(0);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: pageSize,
  });
  const { error, loading, data, fetchMore } = useQuery<
    typeof queryDocument,
    typeof variables
  >(queryDocument, {
    variables: { ...variables, first: pageSize, offset: offset },
    onCompleted: () =>
      setPagination({
        ...pagination,
        total: data?.[fieldName]?.totalCount,
      }),
  });

  const handleTableChange = useCallback(
    async (pagination) => {
      setPagination({ ...pagination });
      const { current, pageSize } = pagination;
      const newOffset = (current - 1) * pageSize;

      await fetchMore({
        variables: {
          offset: newOffset,
        },
      });
      setOffset(newOffset);
    },
    [fetchMore]
  );

  return (
    <>
      {error ? (
        <Paragraph>{error}</Paragraph>
      ) : data && data[fieldName].nodes ? (
        <Table
          loading={loading}
          columns={columns}
          dataSource={data[fieldName].nodes}
          pagination={showPagination && pagination}
          onChange={handleTableChange}
          rowKey={(obj) => obj.id}
          rowClassName={(record, _index) =>
            record?.isHighlighted ? "table-row-highlight" : ""
          }
        />
      ) : (
        ""
      )}
    </>
  );
}
