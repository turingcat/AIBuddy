import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createElectronFetch } from './electronFetch';

class RequestDouble extends EventEmitter {
  setHeader = vi.fn();
  write = vi.fn();
  end = vi.fn();
  abort = vi.fn();
}
function fixture() {
  const request = new RequestDouble();
  const net = { request: vi.fn(() => request) };
  return { request, net, fetch: createElectronFetch(net as never) };
}
describe('Electron 22 networking', () => {
  it('keeps native fetch on modern Electron', () => {
    const fetch = vi.fn();
    expect(createElectronFetch({ fetch } as never)).toBe(fetch);
  });
  it('uses Chromium networking and exposes responses before EOF', async () => {
    const { fetch, net, request } = fixture();
    const pending = fetch('https://localhost:123/status', {
      headers: { Authorization: 'Bearer test' },
    });
    const reply = Object.assign(new PassThrough(), {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'application/json' },
    });
    request.emit('response', reply);
    const response = await pending;
    expect(net.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://localhost:123/status', method: 'GET' })
    );
    expect(request.setHeader).toHaveBeenCalledWith('authorization', 'Bearer test');
    expect(response.ok).toBe(true);
    reply.end('{"ready":true}');
    expect(await response.json()).toEqual({ ready: true });
  });
  it('forwards POST bodies and returns HTTP failures', async () => {
    const { fetch, request } = fixture();
    const pending = fetch('https://example.com/login', { method: 'POST', body: '{"a":1}' });
    await vi.waitFor(() => expect(request.end).toHaveBeenCalled());
    expect(
      Buffer.concat(request.write.mock.calls.map(([value]) => Buffer.from(value))).toString()
    ).toBe('{"a":1}');
    request.emit(
      'response',
      Object.assign(new PassThrough(), {
        statusCode: 401,
        statusMessage: 'Unauthorized',
        headers: {},
      })
    );
    expect((await pending).status).toBe(401);
  });
  it('rejects already aborted requests without connecting', async () => {
    const { fetch, net } = fixture();
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(fetch('https://example.com', { signal: controller.signal })).rejects.toThrow(
      'cancelled'
    );
    expect(net.request).not.toHaveBeenCalled();
  });
  it('aborts the transport and preserves timeout reasons', async () => {
    const { fetch, request } = fixture();
    const controller = new AbortController();
    const pending = fetch('https://example.com', { signal: controller.signal });
    controller.abort(new Error('deadline'));
    await expect(pending).rejects.toThrow('deadline');
    expect(request.abort).toHaveBeenCalled();
  });
  it('propagates connection errors', async () => {
    const { fetch, request } = fixture();
    const pending = fetch('https://example.com');
    request.emit('error', new Error('connection failed'));
    await expect(pending).rejects.toThrow('connection failed');
  });
  it('handles empty responses and array headers', async () => {
    const { fetch, request } = fixture();
    const pending = fetch('https://example.com', { method: 'HEAD' });
    const reply = Object.assign(new PassThrough(), {
      statusCode: 204,
      statusMessage: 'No Content',
      headers: { 'set-cookie': ['a=1', 'b=2'] },
    });
    request.emit('response', reply);
    const response = await pending;
    expect(response.body).toBeNull();
    expect(response.headers.get('set-cookie')).toContain('a=1');
    reply.end();
  });
  it('cancels the network response when its consumer cancels', async () => {
    const { fetch, request } = fixture();
    const pending = fetch('https://example.com');
    const reply = Object.assign(new PassThrough(), {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
    });
    request.emit('response', reply);
    const response = await pending;
    await response.body!.cancel();
    expect(request.abort).toHaveBeenCalled();
    expect(reply.destroyed).toBe(true);
  });
  it('rejects truncated response streams', async () => {
    const { fetch, request } = fixture();
    const pending = fetch('https://example.com');
    const reply = Object.assign(new PassThrough(), {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
    });
    request.emit('response', reply);
    const response = await pending;
    const text = response.text();
    reply.destroy();
    await expect(text).rejects.toThrow('Response closed');
  });
  it('propagates response errors to the body reader', async () => {
    const { fetch, request } = fixture();
    const pending = fetch('https://example.com');
    const reply = Object.assign(new PassThrough(), {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
    });
    request.emit('response', reply);
    const response = await pending;
    const text = response.text();
    reply.destroy(new Error('stream failed'));
    await expect(text).rejects.toThrow('stream failed');
  });
});
