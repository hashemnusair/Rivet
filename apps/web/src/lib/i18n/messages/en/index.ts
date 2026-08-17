import { common } from "./common";
import { domain } from "./domain";
import { marketing } from "./marketing";
import { nav } from "./nav";

/**
 * English is the source of truth: `Messages` is derived from it, so the Arabic
 * catalogue fails to compile the moment a key is added here and not there.
 * Areas are separate modules purely so each stays reviewable.
 */
export const en = {
  common,
  domain,
  marketing,
  nav,
};

export type Messages = typeof en;
