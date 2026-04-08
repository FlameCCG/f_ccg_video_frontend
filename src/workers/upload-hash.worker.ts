/// <reference lib="webworker" />

import { createSHA256 } from 'hash-wasm'

interface HashWorkerRequest {
  chunkSize: number
  file: File
}

type HashWorkerResponse =
  | { type: 'done'; hash: string }
  | { type: 'error'; error: string }
  | { type: 'progress'; pct: number }

declare const self: DedicatedWorkerGlobalScope

const workerScope = self

const postProgress = (processedBytes: number, totalBytes: number, lastProgress: number) => {
  const pct =
    totalBytes === 0 ? 100 : Math.min(100, Math.round((processedBytes / totalBytes) * 100))
  if (pct === lastProgress) return lastProgress

  workerScope.postMessage({
    type: 'progress',
    pct,
  } satisfies HashWorkerResponse)

  return pct
}

workerScope.onmessage = async (event: MessageEvent<HashWorkerRequest>) => {
  try {
    const { chunkSize, file } = event.data
    const hasher = await createSHA256()
    hasher.init()

    if (file.size === 0) {
      workerScope.postMessage({
        type: 'done',
        hash: hasher.digest(),
      } satisfies HashWorkerResponse)
      return
    }

    let processedBytes = 0
    let lastProgress = -1

    if (typeof file.stream === 'function') {
      const reader = file.stream().getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value?.byteLength) continue

          hasher.update(value)
          processedBytes += value.byteLength
          lastProgress = postProgress(processedBytes, file.size, lastProgress)
        }
      } finally {
        reader.releaseLock()
      }
    } else {
      while (processedBytes < file.size) {
        const end = Math.min(processedBytes + chunkSize, file.size)
        const buffer = await file.slice(processedBytes, end).arrayBuffer()
        hasher.update(new Uint8Array(buffer))
        processedBytes = end
        lastProgress = postProgress(processedBytes, file.size, lastProgress)
      }
    }

    workerScope.postMessage({
      type: 'done',
      hash: hasher.digest(),
    } satisfies HashWorkerResponse)
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : '文件哈希计算失败',
    } satisfies HashWorkerResponse)
  }
}

export {}
