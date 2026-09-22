/**
 * Types for the Ask engine (engine.js), the assistant every Mobius app runs.
 * engine.js is a copy of ../../../ask/engine.js; re-copy it to update. It is
 * plain JavaScript, so the shapes here are deliberately loose.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function createAssistant(config: any): any;
export function makeAppView(opts: any): {
  appView: (env: any, name: string, args?: any, ctx?: any) => Promise<any>;
  appViews: () => string[];
  viewBlurbs: () => Record<string, string>;
  readableTables: (env: any) => Promise<string[]>;
};
export function makeSecretKey(names?: string[]): (key: string) => boolean;
export function scopeSql(sql: string, scopes: Record<string, string>): string;
export function routeAction(action: any): any;
export function gateSql(raw: string, allowed: string[], opts?: any): { sql?: string; error?: string };
export function reportText(report: any): string;
export const toSlackText: (s: string) => string;
