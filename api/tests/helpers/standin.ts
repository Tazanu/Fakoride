/**
 * A local stand-in for a third-party API.
 *
 * Fapshi, the SMS aggregator and Expo's push service each have one adapter in
 * this codebase, and each adapter is the only thing between us and a driver not
 * being paid, a code never arriving, or a ride offer nobody sees. None of them
 * can be tested against the real service from a test run — the real ones move
 * money, send texts, and need accounts.
 *
 * So each test stands up one of these on a free local port, speaking the
 * provider's documented contract, and asserts on exactly what our adapter sent:
 * the path, the headers, the body. Recording what was sent is the point. An
 * adapter that talks to a stand-in which accepts anything proves nothing.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";

export type Recorded = {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
  json: unknown;
};

export type Reply = { status?: number; json?: unknown; text?: string; delayMs?: number };

export type StandIn = {
  url: string;
  calls: Recorded[];
  /** Replace how the next requests are answered. */
  answer: (fn: (req: Recorded) => Reply) => void;
  close: () => Promise<void>;
};

export async function standIn(handler: (req: Recorded) => Reply): Promise<StandIn> {
  const calls: Recorded[] = [];
  let respond = handler;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      let json: unknown = undefined;
      try {
        json = body ? JSON.parse(body) : undefined;
      } catch {
        json = undefined;
      }
      const rec: Recorded = { method: req.method ?? "", path: req.url ?? "", headers: req.headers, body, json };
      calls.push(rec);

      const reply = respond(rec);
      const send = () => {
        res.statusCode = reply.status ?? 200;
        if (reply.json !== undefined) {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(reply.json));
        } else {
          res.end(reply.text ?? "");
        }
      };
      if (reply.delayMs) setTimeout(send, reply.delayMs);
      else send();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    answer: (fn) => {
      respond = fn;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
