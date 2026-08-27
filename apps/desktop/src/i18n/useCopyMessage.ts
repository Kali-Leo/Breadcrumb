/**
 * Purpose: renders a CopyMessage — the {key, params} pair a pure-logic package returns when
 * it has decided which sentence applies but must not write it (spec 058 §2).
 * Main exports: useCopyMessage.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";
import { useTranslation } from "react-i18next";

export function useCopyMessage(): (message: CopyMessage) => string {
  const { t } = useTranslation();
  return (message) => t(message.key as never, message.params ?? {});
}
