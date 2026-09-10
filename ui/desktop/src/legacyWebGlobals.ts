import { fetch, Headers, Request, Response, FormData } from 'undici';
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web';

// Electron 22 embeds Node 16, which predates the stable web API globals.
if (process.versions.electron?.split('.')[0] === '22') {
  const globals = {
    fetch,
    Headers,
    Request,
    Response,
    FormData,
    ReadableStream,
    WritableStream,
    TransformStream,
  };
  for (const [name, value] of Object.entries(globals)) {
    if (!(name in globalThis))
      Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
}
