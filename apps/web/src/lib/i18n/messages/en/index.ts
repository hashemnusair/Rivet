import { common } from "./common";

/**
 * English is the source of truth: `Messages` is derived from it, so the Arabic
 * catalogue fails to compile the moment a key is added here and not there.
 * Areas are separate modules purely so each stays reviewable.
 */
export const en = {
  common,
};

export type Messages = typeof en;
