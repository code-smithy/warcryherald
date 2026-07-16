import {
  CampaignTimeline,
  ConfirmationScroll,
  FighterCard,
  HeraldPanel,
  LedgerTable,
  ParchmentCard,
  RunemarkBadge,
  SectionBanner,
  StatBlock,
  WarbandBanner,
  WaxSealBadge
} from "../components/design-system";

export function StyleGuidePage() {
  return (
    <main className="page">
      <section className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Visual style guide</p>
          <h1>Campaign ledger system</h1>
          <p>
            Original fantasy ledger components for campaign workflows. The system uses readable
            body text, restrained decoration, visible focus states, and dense layouts that collapse
            cleanly on narrow screens.
          </p>
        </div>
        <WaxSealBadge>Phase 9</WaxSealBadge>
      </section>

      <section className="style-guide-grid" aria-label="Design system examples">
        <HeraldPanel tone="ember">
          <SectionBanner eyebrow="HeraldPanel" title="Campaign command">
            Framed surfaces use parchment texture, ink borders, and faction accent bands without
            blocking pointer or keyboard interaction.
          </SectionBanner>
          <StatBlock
            stats={[
              { label: "Members", value: 6 },
              { label: "Warbands", value: 4 },
              { label: "Glory", value: 11 },
              { label: "Reputation", value: 8 }
            ]}
          />
        </HeraldPanel>

        <ParchmentCard>
          <SectionBanner eyebrow="ParchmentCard" title="Compact record" />
          <p className="muted">
            Cards are used for repeated records and never as nested page sections. Radius stays
            tight so the interface reads as a ledger rather than a marketing page.
          </p>
          <div className="tag-list">
            <RunemarkBadge>Leader</RunemarkBadge>
            <RunemarkBadge tone="steel">Scout</RunemarkBadge>
            <RunemarkBadge tone="verdant">Beast</RunemarkBadge>
          </div>
        </ParchmentCard>

        <HeraldPanel>
          <WarbandBanner
            faction="Ironroot Kin"
            name="The Gate Oath"
            status={<WaxSealBadge tone="steel">Battle-ready</WaxSealBadge>}
          >
            Banner rows carry warband identity, status, and a short operational summary.
          </WarbandBanner>
          <FighterCard
            name="Mara of the Third Bell"
            subtitle="Shieldbreaker - 145 pts"
            badges={<RunemarkBadge tone="ember">Hero</RunemarkBadge>}
            stats={[
              { label: "Move", value: 4 },
              { label: "Tough", value: 5 },
              { label: "Wounds", value: 22 }
            ]}
          >
            <p className="muted">
              Fighter cards keep profile information, status controls, and progression summaries
              scannable on desktop and single-column on mobile.
            </p>
          </FighterCard>
        </HeraldPanel>

        <HeraldPanel tone="shadow">
          <SectionBanner eyebrow="CampaignTimeline" title="Chronicle entries" />
          <CampaignTimeline
            emptyMessage="No activity."
            entries={[
              {
                id: "one",
                title: "The Gate Oath completed aftermath",
                meta: "Battle completed",
                time: "2026-07-16T12:00:00.000Z"
              },
              {
                id: "two",
                title: "Mara gained a heroic trait",
                meta: "Progression journal",
                time: "2026-07-16T12:30:00.000Z"
              }
            ]}
          />
        </HeraldPanel>

        <HeraldPanel className="style-guide-wide" tone="steel">
          <SectionBanner eyebrow="LedgerTable" title="Dense campaign data" />
          <LedgerTable
            caption="Battle roster"
            columns={["Fighter", "Range", "Attacks", "Damage"]}
            emptyMessage="No rows."
            rows={[
              { id: "blade", cells: ["Mara", "1", "4", "2/4"] },
              { id: "bow", cells: ["Orric", "8", "2", "1/3"] }
            ]}
          />
        </HeraldPanel>

        <ConfirmationScroll
          className="style-guide-wide"
          title="ConfirmationScroll"
          actions={
            <>
              <button className="button" type="button">
                Confirm
              </button>
              <button className="button button--secondary" type="button">
                Cancel
              </button>
            </>
          }
        >
          <p>
            Use scroll styling for consequential confirmations, aftermath application, and archive
            actions where a clear review step matters.
          </p>
        </ConfirmationScroll>
      </section>
    </main>
  );
}
