/**
 * An error a quota route answers with the status and code it carries. Only
 * the extension layer and configuration validation throw these. A built-in's
 * failure is a result with `ok: false`, and any other throw stays 500 under
 * `/api/quota`, whatever fields it happens to carry.
 */
export class QuotaRouteError extends Error {
  declare status: number;
  declare code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'QuotaRouteError';
    this.status = status;
    this.code = code;
  }
}
