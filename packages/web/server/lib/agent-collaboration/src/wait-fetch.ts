import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// The tool's deadline and cancellation signal own long-lived session waits.
export const waitFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const body = Buffer.from(await request.arrayBuffer());
  return new Promise<Response>((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = send(url, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      signal: request.signal,
      timeout: 0,
    }, incoming => {
      const headers = new Headers();
      let name = "";
      for (const [index, value] of incoming.rawHeaders.entries()) {
        if (index % 2 === 0) name = value;
        else headers.append(name, value);
      }
      const chunks: Buffer[] = [];
      incoming.on("data", chunk => chunks.push(Buffer.from(chunk)));
      incoming.once("error", reject);
      incoming.once("end", function (this: { statusCode: number }) {
        const status = this.statusCode;
        resolve(new Response(status === 204 ? null : Buffer.concat(chunks), { status, headers }));
      });
    });
    outgoing.once("error", reject);
    outgoing.end(body);
  });
};
