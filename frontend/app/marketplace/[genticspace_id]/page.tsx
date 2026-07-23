import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentAvatar } from "@/components/ui/AgentAvatar";
import { DeploymentGuideSection } from "@/components/agent/DeploymentGuideSection";
import { FavoriteButton } from "@/components/agent/FavoriteButton";
import { SandboxSection } from "@/components/agent/SandboxSection";
import { TrustBadge } from "@/components/agent/TrustBadge";
import { getAgent, ApiError } from "@/lib/api";
import { agentId } from "@/lib/agent";

/** "Listing details" / capability tone — solid cyan tint, matches the design's chip style for license/deployment/pricing pills. */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-sm border font-semibold text-[11px] bg-cyan/14 border-cyan/35 text-cyan">
      {children}
    </span>
  );
}

/** "Categories" tone — a shade lighter than Badge, matches the design's skills/category pills. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5 rounded-sm border font-semibold text-xs bg-cyan/10 border-cyan/30 text-cyan">
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
      className="glass-chip flex items-center justify-between gap-3 px-4 py-3 rounded no-underline hover:border-white transition-colors"
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
  params: Promise<{ genticspace_id: string }>;
}) {
  const { genticspace_id } = await params;

  let agent;
  try {
    agent = await getAgent(genticspace_id);
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

  // "Listing details" sidebar chips — license/deployment/access/pricing, the
  // same fields the old badge row showed, just grouped to match the design's
  // dedicated sidebar box.
  const listingDetails: string[] = [];
  if (agent.license) listingDetails.push(agent.license);
  agent.deployment_types?.forEach((d) => listingDetails.push(d));
  if (agent.access_model) listingDetails.push(agent.access_model);
  if (agent.pricing_model) listingDetails.push(agent.pricing_model);

  // "Endpoints & protocols" sidebar box — only lists protocols this agent
  // actually declares, with the real endpoints_live flag from the backend
  // (never fabricated per-endpoint status, since the API only reports one
  // liveness flag for the agent as a whole).
  const endpoints: { name: string }[] = [];
  if (agent.a2a_endpoint) endpoints.push({ name: "A2A endpoint" });
  if (agent.mcp_endpoint) endpoints.push({ name: "MCP endpoint" });
  const endpointStatus =
    agent.endpoints_live === true
      ? { label: "Live", className: "text-cyan" }
      : agent.endpoints_live === false
        ? { label: "Down", className: "text-error" }
        : { label: "Unconfirmed", className: "text-foreground-faint" };

  const categoryTags = [
    ...(agent.interaction_types ?? []),
    ...(agent.industry_tags ?? []),
    ...(agent.sdk_compat ?? []),
  ];

  const hasSidebar = listingDetails.length > 0 || connects.length > 0 || endpoints.length > 0;

  const sourceLabel = agent.source_id ? `${agent.source} / ${agent.source_id}` : agent.source;

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border">
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
                <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                  <h1 className="font-display font-normal text-[32px] leading-tight text-foreground tracking-tight">
                    {agent.name || agentId(agent)}
                  </h1>
                  <TrustBadge agent={agent} />
                </div>
                <div className="flex items-center gap-2.5 flex-wrap text-[13.5px] text-foreground-faint">
                  <span className="font-mono text-[12.5px] text-foreground-faint px-2 py-[3px] rounded-sm bg-surface-2 border border-border">
                    {agentId(agent)}
                  </span>
                  <span>·</span>
                  <span>{sourceLabel}</span>
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
                      <a
                        href={agent.support_channel.includes("@") ? `mailto:${agent.support_channel}` : agent.support_channel}
                        target={agent.support_channel.includes("@") ? undefined : "_blank"}
                        rel="noopener noreferrer"
                        className="text-cyan hover:underline"
                      >
                        Support
                      </a>
                    </>
                  )}
                  {agent.terms_url && (
                    <>
                      <span>·</span>
                      <a href={agent.terms_url} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">
                        Terms
                      </a>
                    </>
                  )}
                </div>
              </div>
              <FavoriteButton genticspaceId={agentId(agent)} />
            </div>

            {(agent.a2a_endpoint || agent.mcp_endpoint || agent.x402_support || agent.safe_to_transact) && (
              <div className="flex gap-1.5 flex-wrap mb-6">
                {agent.a2a_endpoint && <Badge>A2A</Badge>}
                {agent.mcp_endpoint && <Badge>MCP</Badge>}
                {agent.x402_support && <Badge>x402</Badge>}
                {agent.safe_to_transact && <Badge>Safe to transact</Badge>}
              </div>
            )}

            <div className="mb-8 max-w-[720px]">
              <span className="font-bold text-[12.5px] text-foreground-faint uppercase tracking-wide block mb-2.5">
                About
              </span>
              <p className="text-[15px] leading-relaxed text-foreground-muted">
                {agent.description || "No description indexed for this agent yet."}
              </p>
            </div>

            <div
              className="grid gap-8"
              style={{ gridTemplateColumns: hasSidebar ? "280px minmax(0, 1fr)" : "minmax(0, 1fr)" }}
            >
              {hasSidebar && (
                <div className="flex flex-col gap-6">
                  {listingDetails.length > 0 && (
                    <div>
                      <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide block mb-2.5">
                        Listing details
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {listingDetails.map((d) => (
                          <Badge key={d}>{d}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {connects.length > 0 && (
                    <div>
                      <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide block mb-2.5">
                        Connected accounts
                      </span>
                      <div className="flex flex-col gap-2.5">
                        {connects.map((c) => (
                          <ConnectLink key={c.label} label={c.label} href={c.href} />
                        ))}
                      </div>
                    </div>
                  )}

                  {endpoints.length > 0 && (
                    <div>
                      <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide block mb-2.5">
                        Endpoints &amp; protocols
                      </span>
                      <div className="flex flex-col gap-2">
                        {endpoints.map((ep) => (
                          <div
                            key={ep.name}
                            className="glass-chip flex items-center justify-between px-3 py-2.5 rounded"
                          >
                            <span className="font-semibold text-[12.5px] text-foreground-muted">{ep.name}</span>
                            <span className={`flex items-center gap-1.5 font-semibold text-[11px] ${endpointStatus.className}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {endpointStatus.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-6 min-w-0">
                {agent.sandboxable && agent.sandbox_url && (
                  <SandboxSection genticspaceId={agentId(agent)} />
                )}

                <DeploymentGuideSection genticspaceId={agentId(agent)} />

                {agent.skills && agent.skills.length > 0 && (
                  <div className="glass-panel p-[26px] rounded box-border">
                    <span className="font-display font-normal text-sm text-foreground block mb-4">Skills</span>
                    <div className="flex flex-col gap-3">
                      {agent.skills.map((skill, i) => (
                        <div key={skill.skill_id || i} className="glass-chip p-3.5 rounded">
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

                {categoryTags.length > 0 && (
                  <div>
                    <span className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide block mb-2.5">
                      Categories
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {categoryTags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
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
