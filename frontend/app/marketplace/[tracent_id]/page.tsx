import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentAvatar } from "@/components/ui/AgentAvatar";
import { DeploymentGuideSection } from "@/components/agent/DeploymentGuideSection";
import { FavoriteButton } from "@/components/agent/FavoriteButton";
import { getAgent, ApiError } from "@/lib/api";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-sm border font-semibold text-[11px] bg-cyan/14 border-cyan/35 text-cyan">
      {children}
    </span>
  );
}

const TRUST_TIER_LABELS: Record<string, string> = {
  onchain: "On-chain",
  tracent: "Genticspace-verified",
};

function ConnectLink({ label, href }: { label: string; href: string }) {
  const isEmail = href.includes("@") && !href.startsWith("http");
  return (
    <a
      href={isEmail ? `mailto:${href}` : href}
      target={isEmail ? undefined : "_blank"}
      rel={isEmail ? undefined : "noopener noreferrer"}
      className="flex items-center justify-between gap-3 px-4 py-3 rounded bg-[rgba(244,247,243,.04)] border border-border no-underline hover:border-border-strong transition-colors"
    >
      <span className="font-semibold text-[13px] text-foreground">{label}</span>
      <span className="text-[12.5px] text-cyan font-mono overflow-hidden text-ellipsis whitespace-nowrap max-w-[260px]">
        {href}
      </span>
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
  if (agent.support_channel) connects.push({ label: "Support", href: agent.support_channel });
  if (agent.terms_url) connects.push({ label: "Terms of service", href: agent.terms_url });
  if (agent.contact_email) connects.push({ label: "Contact", href: agent.contact_email });

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background-page box-border">
        <div className="relative px-[5%] pt-12 pb-8 overflow-hidden box-border">
          <div
            className="absolute -top-40 right-[10%] w-[420px] h-[420px] glow-blob-static"
            style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
          />
          <div className="relative">
            <Link href="/marketplace" className="inline-block mb-6 font-semibold text-[13px] text-cyan no-underline">
              ← Back to marketplace
            </Link>

            <div className="flex items-start gap-4 flex-wrap mb-5">
              <AgentAvatar imageUrl={agent.image_url} size={72} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <h1 className="font-display font-bold text-[32px] leading-tight text-foreground tracking-tight break-words min-w-0">
                    {agent.name || agent.tracent_id}
                  </h1>
                  {agent.verified && (
                    <span title="Verified" className="text-cyan text-xl flex-none">
                      ✓
                    </span>
                  )}
                </div>
                <div className="text-[14px] text-foreground-faint font-mono mt-1 break-all">
                  {agent.provider_org ? (
                    <Link
                      href={`/company/${agent.source}/${encodeURIComponent(agent.provider_org)}`}
                      className="text-cyan hover:underline"
                    >
                      {agent.provider_org}
                    </Link>
                  ) : (
                    agent.tracent_id
                  )}
                </div>
              </div>
              <FavoriteButton tracentId={agent.tracent_id} />
            </div>

            <div className="flex gap-1.5 flex-wrap mb-6">
              {agent.trust_tier && <Badge>{TRUST_TIER_LABELS[agent.trust_tier] ?? agent.trust_tier}</Badge>}
              {agent.a2a_endpoint && <Badge>A2A</Badge>}
              {agent.mcp_endpoint && <Badge>MCP</Badge>}
              {agent.x402_support && <Badge>x402</Badge>}
              {agent.safe_to_transact && <Badge>Safe to transact</Badge>}
              {agent.license && <Badge>{agent.license}</Badge>}
              {agent.deployment_types?.map((dep) => <Badge key={dep}>{dep}</Badge>)}
              {agent.access_model && <Badge>{agent.access_model}</Badge>}
              {agent.pricing_model && <Badge>{agent.pricing_model}</Badge>}
              {agent.industry_tags?.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>

            <p className="text-[15px] leading-relaxed text-foreground-muted max-w-[720px] mb-8 break-words">
              {agent.description || "No description indexed for this agent yet."}
            </p>

            <div
              className="grid gap-8"
              style={{ gridTemplateColumns: connects.length > 0 ? "280px minmax(0, 1fr)" : "minmax(0, 1fr)" }}
            >
              {connects.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="font-bold text-[12.5px] text-foreground-faint uppercase tracking-wide mb-1">
                    Connects
                  </span>
                  {connects.map((c) => (
                    <ConnectLink key={c.label} label={c.label} href={c.href} />
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-6 min-w-0">
                <DeploymentGuideSection tracentId={agent.tracent_id} />

                {agent.skills && agent.skills.length > 0 && (
                  <div className="p-[26px] rounded bg-surface-2 border border-border box-border">
                    <span className="font-display font-bold text-sm text-foreground block mb-4">Skills</span>
                    <div className="flex flex-col gap-3">
                      {agent.skills.map((skill, i) => (
                        <div key={skill.skill_id || i} className="p-3.5 rounded bg-[rgba(244,247,243,.04)] border border-border">
                          <div className="font-semibold text-[13.5px] text-foreground mb-1">
                            {skill.skill_name || "Untitled skill"}
                          </div>
                          {skill.description && (
                            <div className="text-[12.5px] text-foreground-muted">{skill.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
