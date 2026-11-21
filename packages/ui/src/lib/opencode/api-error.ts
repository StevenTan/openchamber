export class OpencodeApiError extends Error {
  readonly operation: string
  readonly status: number | undefined
  readonly tag: string | undefined
  readonly detail: string
  readonly ref: string | undefined

  constructor(operation: string, message: string, options: { status?: number; tag?: string; ref?: string; cause?: unknown }) {
    super(`${operation} failed${options.status ? ` (${options.status})` : ""}: ${message}`, { cause: options.cause })
    this.name = "OpencodeApiError"
    this.operation = operation
    this.status = options.status
    this.tag = options.tag
    this.detail = message
    this.ref = options.ref
  }
}
