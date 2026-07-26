export interface Agent {
  tracent_id: string;
  source: string;
  source_id: string;
  owner_address: string | null;
  name: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  x402_support: boolean;
  a2a_endpoint: string | null;
  mcp_endpoint: string | null;
  web_endpoint: string | null;
  endpoints_live: boolean | null;
  provider_org: string | null;
  provider_url: string | null;
  verified: boolean;
  trust_tier: string | null;
  risk_score: number;
  safe_to_transact: boolean;
  first_seen: string;
  domain: string | null;
  submitted_by?: number | null;
  license?: string | null;
  deployment_types?: string[] | null;
  access_model?: string | null;
  pricing_model?: string | null;
  interaction_types?: string[] | null;
  sdk_compat?: string[] | null;
  industry_tags?: string[] | null;
  support_channel?: string | null;
  terms_url?: string | null;
  contact_email?: string | null;
  is_private?: boolean;
  github_url?: string | null;
  huggingface_url?: string | null;
  ard_ref?: string | null;
  producthunt_url?: string | null;
  erc8004_ref?: string | null;
  skills?: AgentSkill[];
  is_favorited?: boolean;
}

export interface AgentSkill {
  skill_id: string | null;
  skill_name: string | null;
  description: string | null;
  tags: string | null;
}

export interface DeploymentGuide {
  instructions: string;
  generated_at: string | null;
  cached: boolean;
  has_readme: boolean;
}

export interface AgentListingInput {
  name: string;
  description: string;
  image_url?: string;
  demo_url?: string;
  github_url?: string;
  huggingface_url?: string;
  ard_ref?: string;
  producthunt_url?: string;
  erc8004_ref?: string;
  website_url?: string;
  contact_email?: string;
  support_channel?: string;
  terms_url?: string;
  interaction_types: string[];
  sdk_compat: string[];
  industry_tags: string[];
  license: string;
  deployment_types: string[];
  access_model: string;
  pricing_model: string;
  is_private: boolean;
}

export interface AgentsListResponse {
  total: number;
  page: number;
  page_size: number;
  agents: Agent[];
}

export interface TopProvider {
  name: string;
  source: string;
  agent_count: number;
  followers: number;
  image_url: string | null;
  industry_tags: string[] | null;
}

export interface Recommendation extends Agent {
  score: number;
  reasons: string[];
}

export interface User {
  id: number;
  email: string;
  account_type: "individual" | "business";
  name: string | null;
  company_name: string | null;
  experience_level: "Beginner" | "Intermediate" | "Advanced" | null;
  use_case: string | null;
  purposes: string[] | null;
  bio: string | null;
  github_username: string | null;
  x_handle: string | null;
  linkedin_handle: string | null;
  website_url: string | null;
  huggingface_handle: string | null;
  other_link: string | null;
  email_verified: boolean;
  created_at: string;
  industry?: string | null;
  is_private?: boolean;
  show_follower_count?: boolean;
  notify_new_follower?: boolean;
  notify_agent_review?: boolean;
}

export interface UpdateProfilePayload {
  name?: string;
  company_name?: string;
  bio?: string;
  industry?: string;
  website_url?: string;
  experience_level?: string;
  purposes?: string[];
  connects?: ConnectAccounts;
  is_private?: boolean;
  show_follower_count?: boolean;
  notify_new_follower?: boolean;
  notify_agent_review?: boolean;
}

export interface Review {
  id: number;
  rating: number;
  text: string | null;
  created_at: string;
  tracent_id?: string;
  agent_name?: string;
  user_id?: number;
  author_name?: string;
}

export interface UserProfile {
  id: number;
  name: string | null;
  account_type?: "individual" | "business";
  bio?: string | null;
  purposes?: string[] | null;
  experience_level?: string | null;
  github_username?: string | null;
  x_handle?: string | null;
  linkedin_handle?: string | null;
  website_url?: string | null;
  huggingface_handle?: string | null;
  other_link?: string | null;
  is_private: boolean;
  is_owner: boolean;
  follower_count: number | null;
  is_following: boolean;
  created_at?: string;
  contributions?: Agent[];
  favorites?: Agent[];
  reviews?: Review[];
  companies_followed?: { source: string; name: string }[];
}

export interface OrgProfile {
  source: string;
  name: string;
  agents: Agent[];
  agent_count: number;
  followers: number;
  industry_tags: string[];
  reviews: Review[];
  avg_rating: number | null;
  is_following: boolean;
}

export interface ConnectAccounts {
  github?: string;
  x?: string;
  linkedin?: string;
  website?: string;
  huggingface?: string;
  other?: string;
}

export interface SignupPayload {
  email: string;
  email_verified_token: string;
  password: string;
  account_type: "individual" | "business";
  name?: string;
  company_name?: string;
  experience_level?: string;
  use_case?: string;
  purposes?: string[];
  bio?: string;
  connects?: ConnectAccounts;
}

export interface SandboxConfig {
  sandbox_enabled: boolean;
  runtime: "python" | "node" | null;
}

export type SandboxRunStatus =
  | "queued"
  | "provisioning"
  | "running"
  | "succeeded"
  | "failed"
  | "timeout"
  | "canceled";

export interface SandboxRun {
  run_id: number;
  status: SandboxRunStatus;
  exit_code: number | null;
  logs: string;
  created_at: string;
  finished_at: string | null;
}

export interface MarketplaceFilters {
  q?: string;
  verified?: boolean;
  trust_tier?: string;
  a2a_only?: boolean;
  mcp_only?: boolean;
  x402_only?: boolean;
  safe_only?: boolean;
  industry?: string;
  license?: string;
  deployment?: string;
  page?: number;
  page_size?: number;
}
