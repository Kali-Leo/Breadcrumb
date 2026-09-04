/**
 * Purpose: the settings page's 测试连接 button, wired to the things only the app knows —
 * the network switch, the ledger, and the remembered answer.
 *
 * core-llm's probe is deliberately ignorant of all three: it takes a config and returns an
 * outcome. This module is where that outcome becomes (a) a metered row, because the probe is
 * a real billed call however tiny, and (b) a remembered fact, so the newcomer checklist can
 * say "connected" on the strength of a service that actually answered rather than on the
 * strength of a non-empty text box.
 *
 * Nothing here writes the key anywhere: what is remembered is one boolean.
 * Main exports: testAiConnection.
 */
import { type ConnectionProbeOutcome, probeConnection } from "@breadcrumb/core-llm";
import { useSettingsStore } from "../../stores/settingsStore";
import { llmConfigWithoutLanguageDirective } from "../platform/llmConfig";
import type { ApiConfig } from "../platform/settingsSchema";
import { recordMeteredCall } from "./metering";

/** The probe's own metering purpose — on the spending page's grand total, and nowhere else:
 * it has no switch, because a button the learner presses is its own switch. */
export const CONNECTION_TEST_PURPOSE = "connection-test";

/**
 * Runs one probe against the given credentials and remembers whether it worked.
 *
 * The network switch is answered here rather than by letting the request fail: with the
 * switch off there is nothing to diagnose and nothing to bill, and "your network switch is
 * off" is a better sentence than anything a rejected fetch could produce.
 */
export async function testAiConnection(config: ApiConfig): Promise<ConnectionProbeOutcome> {
  const { networkEnabled, setApiConnectionOk } = useSettingsStore.getState();
  if (!networkEnabled) return "offline";

  const result = await probeConnection(llmConfigWithoutLanguageDirective(config));
  const usage = result.usage;
  if (usage !== undefined && usage.inputTokens + usage.outputTokens > 0) {
    try {
      await recordMeteredCall({
        purpose: CONNECTION_TEST_PURPOSE,
        model: config.model,
        conversationId: null,
        usage,
      });
    } catch {
      // Best effort: a ledger that cannot be written must not swallow the diagnosis the
      // learner is standing there waiting for.
    }
  }
  await setApiConnectionOk(result.outcome === "ok");
  return result.outcome;
}
