import { describe, expect, it } from 'vitest';
import { createSurveyAccessToken, verifySurveyAccessToken } from './survey-access-token';

const SECRET = 'test-secret-please-ignore';
const NOW = 1_800_000_000;

describe('survey access token', () => {
  it('verifies a token it just signed', () => {
    const token = createSurveyAccessToken({ surveyId: 'survey-1', expiresAtEpochSeconds: NOW + 3600, secret: SECRET });
    const result = verifySurveyAccessToken({ token, secret: SECRET, nowEpochSeconds: NOW });
    expect(result).toEqual({ ok: true, surveyId: 'survey-1' });
  });

  it('rejects a token past its expiration', () => {
    const token = createSurveyAccessToken({ surveyId: 'survey-1', expiresAtEpochSeconds: NOW - 1, secret: SECRET });
    const result = verifySurveyAccessToken({ token, secret: SECRET, nowEpochSeconds: NOW });
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token whose payload was tampered with', () => {
    const token = createSurveyAccessToken({ surveyId: 'survey-1', expiresAtEpochSeconds: NOW + 3600, secret: SECRET });
    const [payloadB64, signature] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ surveyId: 'survey-2', exp: NOW + 3600 }), 'utf8').toString(
      'base64url',
    );
    const tampered = `${tamperedPayload}.${signature}`;
    const result = verifySurveyAccessToken({ token: tampered, secret: SECRET, nowEpochSeconds: NOW });
    expect(result).toEqual({ ok: false, reason: 'tampered' });
    expect(payloadB64).not.toEqual(tamperedPayload);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSurveyAccessToken({ surveyId: 'survey-1', expiresAtEpochSeconds: NOW + 3600, secret: 'wrong-secret' });
    const result = verifySurveyAccessToken({ token, secret: SECRET, nowEpochSeconds: NOW });
    expect(result).toEqual({ ok: false, reason: 'tampered' });
  });

  it('rejects a malformed token', () => {
    expect(verifySurveyAccessToken({ token: 'not-a-token', secret: SECRET, nowEpochSeconds: NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifySurveyAccessToken({ token: '', secret: SECRET, nowEpochSeconds: NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});
