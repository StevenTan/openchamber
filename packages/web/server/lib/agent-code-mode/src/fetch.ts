import { Extension } from "@opencode/codemode";
import { Effect, Predicate, type Schema } from "effect";

const TIMEOUT_MS = 30_000

type Init = {
  readonly method?: string | undefined
  readonly headers?: Record<string, string> | Array<[string, string]>
  readonly body?: string | Uint8Array<ArrayBuffer> | URLSearchParams | undefined
}

export const fetchExtension = (assert: (url: string, metadata: { method: string; url: string }) => Effect.Effect<void, unknown>, check: (url: string) => Effect.Effect<void, unknown>) => {
  const fetch = (input: string | URL, init: Init = {}) =>
    Effect.gen(function* () {
      const url = String(input).replace(/#.*$/s, "")
      const parsed = URL.parse(url)
      if (parsed?.protocol === "file:") return yield* Effect.fail(new Error("fetch cannot be used for filesystem access."))
      if (parsed?.username || parsed?.password)
        return yield* Effect.fail(new TypeError("fetch cannot be used with credentials in the URL."))
      yield* assert(url, display([input, init]))
      const signal = AbortSignal.timeout(TIMEOUT_MS)
      const follow = (
        target: string,
        request: Init,
        redirects: number,
      ): Effect.Effect<{ response: Response; url: string; redirects: number }, unknown> =>
        Effect.tryPromise({
          try: () => globalThis.fetch(target, { ...request, method: request.method ?? "GET", body: request.body ?? null, redirect: "manual", signal }),
          catch: (error) => error,
        }).pipe(
          Effect.flatMap((response) => {
            const location = response.headers.get("location")
            if (!redirectStatuses.has(response.status) || location === null)
              return Effect.succeed({ response, url: target, redirects })
            if (redirects >= MAX_REDIRECTS)
              return Effect.fail(new Error(`Too many redirects (more than ${MAX_REDIRECTS})`))
            const next = new URL(location, target)
            if (next.protocol !== "http:" && next.protocol !== "https:")
              return Effect.fail(new Error(`fetch cannot follow a redirect to ${next.protocol} URLs.`))
            if (next.username || next.password)
              return Effect.fail(new Error("fetch cannot follow a redirect with credentials in the URL."))
            next.hash = ""
            return check(next.href).pipe(
              Effect.andThen(follow(next.href, redirected(request, response.status, target, next), redirects + 1)),
            )
          }),
        )
      const result = yield* follow(url, init, 0)
      return yield* Effect.tryPromise({ try: () => read(result), catch: (error) => error })
    })

  return Extension.make({ name: "fetch", globals: { fetch: Extension.async(fetch) } })
}

export const display = (args: ReadonlyArray<unknown>) => {
  const [input, init] = args
  const method = Predicate.isObject(init) && Predicate.isString(init.method) ? init.method.toUpperCase() : "GET"
  return { method, url: String(input) }
}

const MAX_REDIRECTS = 20
const redirectStatuses = new Set([301, 302, 303, 307, 308])

const redirected = (request: Init, status: number, from: string, to: URL): Init => {
  const method = request.method?.toUpperCase() ?? "GET"
  const toGet = status === 303 ? method !== "HEAD" : (status === 301 || status === 302) && method === "POST"
  const headers = new Headers(request.headers)
  if (toGet)
    ["content-type", "content-length", "content-encoding", "content-language", "content-location"].forEach((name) =>
      headers.delete(name),
    )
  if (new URL(from).origin !== to.origin)
    ["authorization", "cookie", "proxy-authorization"].forEach((name) => headers.delete(name))
  return {
    method: toGet ? "GET" : request.method,
    headers: Array.from(headers),
    body: toGet ? undefined : request.body,
  }
}

const read = async (result: { response: Response; url: string; redirects: number }) => {
  const response = result.response
  const bytes = await response.bytes()
  const headers = Object.fromEntries(response.headers)
  const text = () => new TextDecoder().decode(bytes)
  return {
    url: result.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    redirected: result.redirects > 0,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
      has: (name: string) => name.toLowerCase() in headers,
      entries: () => Object.entries(headers),
    },
    text: async () => text(),
    json: async (): Promise<Schema.Json> => JSON.parse(text()),
    bytes: async () => bytes,
  }
}

