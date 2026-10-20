// Browser-safe entry: everything here runs in the browser and in Node alike.
// LLM clients and request handlers live in ./server, which only server code imports.
export const VERSION = '1.0.0';

export * from './schema';
export * from './api';
export * from './categories';
