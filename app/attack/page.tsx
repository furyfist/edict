import { prisma } from "@/lib/db/client";
import { getClockState } from "@/lib/clock";
import { Console } from "./Console";
import { DbError, Panel, PageHeader } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * The attack console — what happens when the agent is manipulated.
 *
 * The claim this page exists to test is not that the agent cannot be fooled.
 * It probably can be. The claim is that a fooled agent still cannot exceed its
 * authority, because the thing that decides is a pure function reading
 * re-derived facts, and the thing that moves money is a credential with a
 * ceiling burned into it.
 *
 * So the console makes manipulation easy and then shows you the refusal.
 */
export default async function AttackPage() {
  let vendors;
  let clock;

  try {
    [vendors, clock] = await Promise.all([
      prisma.vendor.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      getClockState(),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Attack console" question="What if it is manipulated?" />
        <DbError />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Attack console"
        question="What happens when someone tries to manipulate the agent?"
      />

      <Panel>
        <p style={{ margin: 0, fontSize: 13, maxWidth: 700 }}>
          The agent reads vendor messages, because refusing to look at them
          would make this demonstration dishonest. Inject one below and run a
          tick. The agent may well be persuaded — watch what happens anyway.
        </p>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            color: "var(--muted)",
            maxWidth: 700,
          }}
        >
          There are three layers between a persuaded agent and your money, and
          none of them is the language model. The amount ceiling is enforced in
          the tokenized credential itself. The merchant, frequency, and duration
          are enforced by Prava. The policy engine is the first gate, and it
          re-derives every fact it decides on rather than taking the agent&rsquo;s
          word for anything.
        </p>
      </Panel>

      <Console vendors={vendors} clockNow={clock.now.toISOString()} />
    </>
  );
}
