import type { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import { Request, Response, type RequestInfo, type RequestInit } from 'undici';
import type { Net } from 'electron';

// Electron 22 has net.request but no net.fetch. Keeping Chromium's transport
// preserves the session certificate verification used by local backends.
export function createElectronFetch(
  net: Pick<Net, 'request'> & Partial<Pick<Net, 'fetch'>>
): typeof globalThis.fetch {
  if (net.fetch) return net.fetch as typeof globalThis.fetch;
  return async (input, init) => {
    const normalized = new Request(input as RequestInfo, init as RequestInit);
    if (normalized.signal.aborted) throw normalized.signal.reason;
    return new Promise((resolve, reject) => {
      const request = net.request({
        url: normalized.url,
        method: normalized.method,
        redirect: normalized.redirect,
      });
      let incoming: Readable | undefined;
      const abort = () => {
        request.abort();
        incoming?.destroy(normalized.signal.reason);
        reject(normalized.signal.reason);
      };
      const cleanup = () => normalized.signal.removeEventListener('abort', abort);
      normalized.signal.addEventListener('abort', abort, { once: true });
      normalized.headers.forEach((value, name) => request.setHeader(name, value));
      request.on('error', (error) => {
        cleanup();
        reject(error);
      });
      request.on('response', (response) => {
        incoming = response as unknown as Readable;
        incoming.once('close', cleanup);
        const headers: [string, string][] = [];
        for (const [name, value] of Object.entries(response.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) headers.push([name, item]);
        }
        const noBody =
          normalized.method === 'HEAD' || [204, 205, 304].includes(response.statusCode);
        let ended = false;
        const stream = incoming;
        const body = noBody
          ? null
          : new ReadableStream<Uint8Array>({
              start(controller) {
                stream.on('data', (chunk: Buffer) => {
                  controller.enqueue(new Uint8Array(chunk));
                  if ((controller.desiredSize ?? 0) <= 0) stream.pause();
                });
                stream.once('end', () => {
                  ended = true;
                  controller.close();
                });
                stream.once('error', (error) => {
                  ended = true;
                  controller.error(error);
                });
                stream.once('close', () => {
                  if (!ended) controller.error(new Error('Response closed before completion'));
                });
              },
              pull() {
                stream.resume();
              },
              cancel() {
                ended = true;
                cleanup();
                request.abort();
                stream.destroy();
              },
            });
        if (noBody) stream.resume();
        const result = new Response(body as ConstructorParameters<typeof Response>[0], {
          status: response.statusCode,
          statusText: response.statusMessage,
          headers,
        });
        Object.defineProperty(result, 'url', { value: normalized.url });
        resolve(result as unknown as globalThis.Response);
      });
      const send = async () => {
        if (normalized.body) {
          const reader = normalized.body.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            request.write(Buffer.from(value));
          }
        }
        request.end();
      };
      send().catch((error) => {
        cleanup();
        request.abort();
        reject(error);
      });
    });
  };
}
