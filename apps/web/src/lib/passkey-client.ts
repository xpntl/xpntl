// Browser-side orchestration for passkeys: fetch options from the API, run the
// WebAuthn ceremony with @simplewebauthn/browser, post the result back.

import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { type LoginResponse, api } from './api';

export function passkeysSupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/** Register a new passkey for the signed-in account. */
export async function registerPasskey(token: string | null | undefined, name?: string): Promise<void> {
  const { options, challengeId } = await api.passkeyRegisterOptions(token);
  const response = await startRegistration({
    optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
  });
  await api.passkeyRegisterVerify({ challengeId, response, name }, token);
}

/** Passwordless sign-in with a discoverable passkey. Returns the login result. */
export async function authenticateWithPasskey(): Promise<LoginResponse> {
  const { options, challengeId } = await api.passkeyAuthOptions();
  const response = await startAuthentication({
    optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
  });
  return api.passkeyAuthVerify({ challengeId, response });
}
