/**
 * apiResponse.test.js — Unit tests for the sendSuccess / AppError utilities
 *
 * These are pure-function tests (no DB, no mocks needed).
 * They verify the response envelope shape that all controllers depend on.
 */
import { sendSuccess } from '../utils/apiResponse.js';
import AppError from '../utils/AppError.js';

// ── Mock res object ───────────────────────────────────────────────────────────
const makeMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// ── sendSuccess ───────────────────────────────────────────────────────────────

describe('sendSuccess', () => {
  it('sends { success: true, data } with the given status code', () => {
    const res = makeMockRes();
    sendSuccess(res, { user: { id: '123' } }, 200);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: { id: '123' } },
    });
  });

  it('sends { success: true, data: null } when data is null', () => {
    const res = makeMockRes();
    sendSuccess(res, null, 200);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: null,
    });
  });

  it('defaults to status 200 when no code is passed', () => {
    const res = makeMockRes();
    sendSuccess(res, { ok: true });

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('uses 201 for resource creation', () => {
    const res = makeMockRes();
    sendSuccess(res, { id: 'new_resource' }, 201);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ── AppError ──────────────────────────────────────────────────────────────────

describe('AppError', () => {
  it('creates an operational error with message and statusCode', () => {
    const err = new AppError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
  });

  it('is an instance of Error', () => {
    const err = new AppError('Forbidden', 403);
    expect(err).toBeInstanceOf(Error);
  });

  it('captures a stack trace', () => {
    const err = new AppError('Server error', 500);
    expect(err.stack).toBeDefined();
  });
});
