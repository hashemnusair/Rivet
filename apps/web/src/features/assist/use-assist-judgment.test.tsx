import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { bumpApiScope } from '@/lib/api/scope';
import type { AssistJudgmentResult } from '@/lib/domain/types';
import { useAssistJudgment } from './use-assist-judgment';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ getApi: () => ({ requestAssistJudgment: mocks.request }) }));
vi.mock('@/lib/hooks/use-api', () => ({ useApiQuery: () => ({ data: { features: [{ ready: true, questions: [{ key: 'navigation.intent' }] }] } }) }));
const unavailable = (message: string): AssistJudgmentResult => ({ status: 'unavailable', reason: 'provider_error', message, retryable: false, correlationId: 'test' });
function pending() {
  let resolve!: (result: AssistJudgmentResult) => void;
  const promise = new Promise<AssistJudgmentResult>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { mocks.request.mockReset(); bumpApiScope(); });
it('shares identical requests within a scope, but isolates a new scope and ignores late results', async () => {
  const old = pending(); const current = pending();
  mocks.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const hook = renderHook(() => useAssistJudgment({ questionKey: 'navigation.intent', subject: { query: 'payment' }, auto: false }));
  act(() => { hook.result.current.request(); hook.result.current.request(); });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  act(() => bumpApiScope());
  expect(hook.result.current.state.status).toBe('idle');
  act(() => hook.result.current.request());
  expect(mocks.request).toHaveBeenCalledTimes(2);
  await act(async () => { old.resolve(unavailable('old workspace')); });
  expect(hook.result.current.state.status).toBe('loading');
  await act(async () => { current.resolve(unavailable('current workspace')); });
  expect(hook.result.current.state).toMatchObject({ message: 'current workspace' });
});
it('isolates platform gyms even when the question and subject are identical', async () => {
  const a = pending(); const b = pending();
  mocks.request.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const hook = renderHook(({ gym }) => useAssistJudgment({ questionKey: 'navigation.intent', auto: false, platformGymId: gym }), { initialProps: { gym: 'gym-a' } });
  act(() => hook.result.current.request());
  hook.rerender({ gym: 'gym-b' });
  act(() => hook.result.current.request());
  expect(mocks.request).toHaveBeenCalledTimes(2);
  await act(async () => { a.resolve(unavailable('a')); b.resolve(unavailable('b')); });
  expect(hook.result.current.state).toMatchObject({ message: 'b' });
});
