import { BlobServiceClient } from "@azure/storage-blob"
import { createWriteStream, ReadStream, unlinkSync } from "node:fs"
import { join } from "node:path"

import type { FileUpload } from "graphql-upload"

declare module "fs" {
  interface ReadStream {
    /**
     * True if the request is a multipart request
     */
    truncated?: boolean
  }
}

interface SaveLocalArgs {
  stream: ReadStream
  filename: string
}

const { AZURE_STORAGE_CONNECTION_STRING, ROOT_URL } = process.env

export async function saveAzure({
  stream,
  filename,
}: SaveLocalArgs): Promise<string> {
  const timestamp = new Date().toISOString().replace(/\D/g, "")
  const id = `${timestamp}_${filename}`
  const relativeLocalPath = join("ilmo/uploads", id)

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURE_STORAGE_CONNECTION_STRING!
    )
    const containerClient = blobServiceClient.getContainerClient("media")
    await containerClient
      .getBlockBlobClient(relativeLocalPath)
      .uploadStream(stream)

    return `https://static.prodeko.org/media/${relativeLocalPath}`
  } catch (e) {
    console.error(e)
    throw e
  }
}

export function saveLocal({
  stream,
  filename,
}: SaveLocalArgs): Promise<string> {
  const timestamp = new Date().toISOString().replace(/\D/g, "")
  const id = `${timestamp}_${filename}`
  const relativeLocalPath = join("/uploads", id)
  const absolutePath = `${ROOT_URL}/uploads/${id}`
  const fsPath = join(process.cwd(), relativeLocalPath)
  return new Promise((resolve, reject) =>
    stream
      .on("error", (error: Error) => {
        if (stream.truncated) {
          // Delete the truncated file
          unlinkSync(fsPath)
        }
        reject(error)
      })
      .on("end", () => {
        resolve(absolutePath)
      })
      .pipe(createWriteStream(fsPath))
  )
}

export async function resolveUpload(upload: FileUpload) {
  const { filename, createReadStream } = upload
  const stream = createReadStream()

  if (AZURE_STORAGE_CONNECTION_STRING) {
    // Save file to Azure Blob Storage
    return await saveAzure({ stream, filename })
  } else {
    // Save file to the local filesystem
    return await saveLocal({ stream, filename })
  }
}
