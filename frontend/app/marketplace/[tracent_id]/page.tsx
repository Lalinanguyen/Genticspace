import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentAvatar } from "@/components/ui/AgentAvatar";
import { AgentTabs } from "@/components/agent/AgentTabs";
import { FavoriteButton } from "@/components/agent/FavoriteButton";
import { getAgent, ApiError } from "@/lib/api";

const TRUST_TIER_LABELS: Record<string, string> = {
  onchain: "On-chain verified",
  tracent: "Genticspace-verified",
  official: "Official",
};

function ListingTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5 rounded-sm bg-cyan/14 border border-cyan/35 font-semibold text-[11.5px] text-cyan">
      {children}
    </span>
  );
}

function ConnectLink({ label, href }: { label: string; href: string }) {
  const isEmail = href.includes("@") && !href.startsWith("http");
  return (
    <a
      href={isEmail ? `mailto:${href}` : href}
      target={isEmail ? undefined : "_blank"}
      rel={isEmail ? undefined : "noopener noreferrer"}
      className="flex items-center gap-2.5 py-1.5 text-foreground no-underline hover:text-cyan-dark"
    >
      <span className="font-medium text-[13px]">{label}</span>
    </a>
  );
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ tracent_id: string }>;
}) {
  const { tracent_id } = await params;

  let agent;
  try {
    agent = await getAgent(tracent_id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const connects: { label: string; href: string }[] = [];
  if (agent.web_endpoint) connects.push({ label: "Website", href: agent.web_endpoint });
  if (agent.github_url) connects.push({ label: "GitHub", href: agent.github_url });
  if (agent.huggingface_url) connects.push({ label: "Hugging Face", href: agent.huggingface_url });
  if (agent.producthunt_url) connects.push({ label: "Product Hunt", href: agent.producthunt_url });
  if (agent.ard_ref) connects.push({ label: "Google ARD", href: agent.ard_ref });
  if (agent.erc8004_ref) connects.push({ label: "ERC-8004", href: agent.erc8004_ref });
  if (agent.support_channel) connects.push({ label: "Support channel", href: agent.support_channel });
  if (agent.terms_url) connects.push({ label: "Terms of service", href: agent.terms_url });
  if (agent.contact_email) connects.push({ label: "Contact", href: agent.contact_email });

  const listingTags = [
    agent.license,
    ...(agent.deployment_types ?? []),
    agent.access_model,
    agent.pricing_model,
  ].filter((t): t is string => !!t);

  const endpoints: { name: string; live: boolean }[] = [];
  if (agent.a2a_endpoint) endpoints.push({ name: "A2A endpoint", live: !!agent.endpoints_live });
  if (agent.mcp_endpoint) endpoints.push({ name: "MCP endpoint", live: !!agent.endpoints_live });
  if (agent.web_endpoint) endpoints.push({ name: "Web endpoint", live: !!agent.endpoints_live });

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background-page box-border">
        <div className="relative px-[5%] pt-12 pb-0 overflow-hidden box-border">
          <div
            className="absolute -top-40 right-[10%] w-[420px] h-[420px] glow-blob-static"
            style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
          />
          <div className="relative">
            <Link href="/marketplace" className="inline-block mb-6 font-semibold text-[13px] text-cyan no-underline">
              ← Back to marketplace
            </Link>

            <div className="flex items-start gap-5 flex-wrap">
              <AgentAvatar imageUrl={agent.image_url} size={72} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap min-w-0 mb-1.5">
                  <h1 className="font-display font-bold text-[32px] leading-tight text-foreground tracking-tight break-words min-w-0">
                    {agent.name || agent.tracent_id}
                  </h1>
                  {agent.trust_tier && (
                    <span className="px-2.5 py-1 rounded-sm border font-bold text-[11px] bg-cyan/14 border-cyan/35 text-cyan">
                      {TRUST_TIER_LABELS[agent.trust_tier] ?? agent.trust_tier}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 flex-wrap text-[13.5px] text-foreground-muted">
                  <span className="font-mono text-[12.5px] px-2 py-1 rounded-sm bg-surface-2 border border-border text-foreground-faint">
                    {agent.tracent_id}
                  </span>
                  {agent.provider_org && (
                    <>
                      <span>·</span>
                      <span>
                        by{" "}
                        <Link
                          href={`/company/${agent.source}/${encodeURIComponent(agent.provider_org)}`}
                          className="text-cyan hover:underline"
                        >
                          {agent.provider_org}
                        </Link>
                      </span>
                    </>
                  )}
                  {agent.support_channel && (
                    <>
                      <span>·</span>
                      <a href={agent.support_channel} className="text-cyan hover:underline">
                        Support
                      </a>
                    </>
                  )}
                  {agent.terms_url && (
                    <>
                      <span>·</span>
                      <a href={agent.terms_url} className="text-cyan hover:underline">
                        Terms
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2.5 flex-none">
                <Link
                  href={`/marketplace/${agent.tracent_id}/try`}
                  className="inline-flex items-center gap-2 h-[46px] box-border px-5 rounded font-semibold text-[13.5px] no-underline"
                  style={{ background: "#1C2621", color: "#EEF1EA" }}
                >
                  ▶ Try this agent
                </Link>
                <FavoriteButton tracentId={agent.tracent_id} />
              </div>
            </div>
          </div>
        </div>

        <div className="px-[5%] pt-9 pb-20 box-border">
          <div className="flex gap-11 items-start flex-wrap">
            <div className="flex-none w-[280px] min-w-[260px] flex flex-col gap-6">
              {agent.avg_rating != null && (
                <div className="p-[22px] rounded bg-surface-2 border border-border box-border flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide">
                      User satisfaction
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-foreground-muted">Avg. rating</span>
                    <span className="flex items-center gap-1.5 font-semibold text-[12.5px]" style={{ color: "#FFC107" }}>
                      ★ {agent.avg_rating.toFixed(1)} · {agent.review_count ?? 0} reviews
                    </span>
                  </div>
                </div>
              )}

              {listingTags.length > 0 && (
                <div>
                  <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide mb-2.5 block">
                    Listing details
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {listingTags.map((tag) => (
                      <ListingTag key={tag}>{tag}</ListingTag>
                    ))}
                  </div>
                </div>
              )}

              {connects.length > 0 && (
                <div>
                  <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide mb-1 block">
                    Connected accounts
                  </span>
                  <div className="flex flex-col">
                    {connects.map((c) => (
                      <ConnectLink key={c.label} label={c.label} href={c.href} />
                    ))}
                  </div>
                </div>
              )}

              {endpoints.length > 0 && (
                <div>
                  <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide mb-2.5 block">
                    Endpoints &amp; protocols
                  </span>
                  <div className="flex flex-col gap-2">
                    {endpoints.map((ep) => (
                      <div
                        key={ep.name}
                        className="flex items-center justify-between px-3 py-2.5 rounded bg-surface-2 border border-border"
                      >
                        <span className="font-semibold text-[12.5px] text-foreground-muted">{ep.name}</span>
                        <span
                          className="flex items-center gap-1.5 font-semibold text-[11px]"
                          style={{ color: ep.live ? "#35C0B0" : "rgba(28,38,33,.4)" }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: ep.live ? "#35C0B0" : "rgba(28,38,33,.3)" }}
                          />
                          {ep.live ? "Live" : "Not confirmed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-[320px]">
              <AgentTabs agent={agent} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
