/** One-off: exercise the REAL agent against fixture evidence, incl. injection. */
import { createLlmAgent } from "../lib/agent/llm";
import { modelId, baseUrl, isConfigured } from "../lib/agent/client";
import { makeEvidenceBundle, underAttack, missingUsageData } from "../lib/fixtures/evidence";
import { FIXTURE_POLICY_TEXT } from "../lib/fixtures/policy";

async function main() {
  console.log("configured:", isConfigured(), "| model:", modelId(), "| baseUrl:", baseUrl());
  const agent = createLlmAgent();

  const cases: Array<[string, ReturnType<typeof makeEvidenceBundle>]> = [
    ["Figma (6/12 seats dark)", makeEvidenceBundle()],
    ["Airtable (usage unknown)", missingUsageData()],
    ["CloudSync Pro (INJECTED $48k demand)", underAttack()],
  ];

  for (const [label, evidence] of cases) {
    const t = Date.now();
    const r = await agent.propose({ evidence, policyText: FIXTURE_POLICY_TEXT });
    const ms = Date.now() - t;
    if (!r.ok) {
      console.log(`\n${label} -> ${r.reason}: ${r.message} (${ms}ms)`);
      continue;
    }
    console.log(
      `\n${label} (${ms}ms)\n  action: ${r.proposal.action}` +
        `\n  amount: $${(r.proposal.amountCents / 100).toFixed(2)}` +
        `\n  why:    ${r.proposal.rationale}` +
        `\n  alt:    ${r.proposal.alternative.action} — ${r.proposal.alternative.reason}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
