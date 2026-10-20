import 'server-only';

// The one door from route handlers to the model code. 'server-only' makes a client import
// of this file a build error, so keys and SDKs never reach the browser bundle.
export { createClient, readEnv, LlmError, handleExtract, handleOcr } from '@app/backend/server';
