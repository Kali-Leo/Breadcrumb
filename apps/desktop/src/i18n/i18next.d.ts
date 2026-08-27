/**
 * Purpose: makes t() key-checked at compile time — a typo in a message key becomes a type
 * error instead of raw key text on screen. The Chinese catalogue is the source of truth for
 * the key shape; every other language must match it.
 */
import type { resources } from "./index";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof resources)["zh-CN"];
    returnNull: false;
  }
}
