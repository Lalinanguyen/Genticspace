import type {
  AgentsListResponse,
  Agent,
  AgentListingInput,
  DeploymentGuide,
  MarketplaceFilters,
  OrgProfile,
  Recommendation,
  Review,
  SandboxConfig,
  SandboxRun,
  SignupPayload,
  TopProvider,
  UpdateProfilePayload,
  User,
  UserProfile,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || res.statusText);
  }
  return res.json() as Promise<T>;
}

function filtersToSearchParams(filters: MarketplaceFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.verified !== undefined) params.set("verified", String(filters.verified));
  if (filters.trust_tier) params.set("trust_tier", filters.trust_tier);
  if (filters.a2a_only) params.set("a2a_only", "true");
  if (filters.mcp_only) params.set("mcp_only", "true");
  if (filters.x402_only) params.set("x402_only", "true");
  if (filters.safe_only) params.set("safe_only", "true");
  if (filters.with_photo) params.set("with_photo", "true");
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.license) params.set("license", filters.license);
  if (filters.deployment) params.set("deployment", filters.deployment);
  params.set("page", String(filters.page ?? 1));
  params.set("page_size", String(filters.page_size ?? 6));
  return params.toString();
}

export function listAgents(filters: MarketplaceFilters): Promise<AgentsListResponse> {
  return request(`/public/agents?${filtersToSearchParams(filters)}`);
}

export function getAgent(tracentId: string, token?: string): Promise<Agent> {
  return request(`/public/agents/${tracentId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function getTopProviders(limit = 12): Promise<{ providers: TopProvider[] }> {
  return request(`/public/top-providers?limit=${limit}`);
}

export function getDeploymentGuide(
  tracentId: string,
  experienceLevel?: string,
  token?: string
): Promise<DeploymentGuide> {
  const params = experienceLevel ? `?experience_level=${encodeURIComponent(experienceLevel)}` : "";
  return request(`/public/agents/${tracentId}/deployment-guide${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function askDeploymentGuide(
  tracentId: string,
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  token?: string
): Promise<{ answer: string }> {
  return request(`/public/agents/${tracentId}/deployment-guide/ask`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({ question, history }),
  });
}

export function getRecommendations(
  task: string,
  token?: string,
  limit = 6
): Promise<{ recommendations: Recommendation[] }> {
  const params = new URLSearchParams({ task, limit: String(limit) });
  return request(`/public/recommendations?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function requestOtp(email: string): Promise<{ status: string }> {
  return request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyOtp(
  email: string,
  code: string
): Promise<{ email_verified_token: string }> {
  return request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function signup(
  payload: SignupPayload
): Promise<{ access_token: string; user: User }> {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(
  email: string,
  password: string
): Promise<{ access_token: string; user: User }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(token: string): Promise<User> {
  return request("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getMyAgents(token: string): Promise<{ agents: Agent[] }> {
  return request("/public/my-agents", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Separate from request(): that helper always sends Content-Type:
// application/json, but a multipart upload needs the browser to set its
// own Content-Type with the multipart boundary -- setting it manually
// here would omit the boundary and the backend couldn't parse the body.
export async function uploadImage(file: File, token: string): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/public/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || res.statusText);
  }
  return res.json();
}

export function createAgentListing(
  payload: AgentListingInput,
  token: string
): Promise<Agent> {
  return request("/public/agents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function updateAgentListing(
  tracentId: string,
  payload: AgentListingInput,
  token: string
): Promise<Agent> {
  return request(`/public/agents/${tracentId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function forgotPassword(email: string): Promise<{ status: string }> {
  return request("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, new_password: string): Promise<{ status: string }> {
  return request("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password }),
  });
}

export function updateProfile(payload: UpdateProfilePayload, token: string): Promise<User> {
  return request("/auth/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function getUserProfile(userId: number, token?: string): Promise<UserProfile> {
  return request(`/public/users/${userId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function getOrgProfile(source: string, org: string, token?: string): Promise<OrgProfile> {
  return request(`/public/orgs/${source}/${encodeURIComponent(org)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function favoriteAgent(tracentId: string, token: string): Promise<{ status: string }> {
  return request(`/public/agents/${tracentId}/favorite`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function unfavoriteAgent(tracentId: string, token: string): Promise<{ status: string }> {
  return request(`/public/agents/${tracentId}/favorite`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function followUser(userId: number, token: string): Promise<{ status: string }> {
  return request(`/public/follow/user/${userId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function unfollowUser(userId: number, token: string): Promise<{ status: string }> {
  return request(`/public/follow/user/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function followOrg(source: string, org: string, token: string): Promise<{ status: string }> {
  return request(`/public/follow/org`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ source, org }),
  });
}

export function unfollowOrg(source: string, org: string, token: string): Promise<{ status: string }> {
  return request(`/public/follow/org?${new URLSearchParams({ source, org }).toString()}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listAgentReviews(tracentId: string): Promise<{ reviews: Review[]; avg_rating: number | null }> {
  return request(`/public/agents/${tracentId}/reviews`);
}

export function submitAgentReview(
  tracentId: string,
  rating: number,
  text: string | undefined,
  token: string
): Promise<Review> {
  return request(`/public/agents/${tracentId}/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rating, text }),
  });
}

export function deleteAgentReview(tracentId: string, token: string): Promise<{ status: string }> {
  return request(`/public/agents/${tracentId}/reviews`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function sendContactMessage(email: string, topic: string, message: string): Promise<{ status: string }> {
  return request("/public/contact", {
    method: "POST",
    body: JSON.stringify({ email, topic, message }),
  });
}

export function getSandboxConfig(tracentId: string): Promise<SandboxConfig> {
  return request(`/public/agents/${tracentId}/sandbox/config`);
}

export function getSandboxReadyAgents(): Promise<{ agents: Agent[] }> {
  return request("/public/sandbox/agents");
}

export function startSandboxRun(tracentId: string, token: string): Promise<{ run_id: number; status: string }> {
  return request(`/public/agents/${tracentId}/sandbox/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getSandboxRun(runId: number, token: string): Promise<SandboxRun> {
  return request(`/public/sandbox/runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function stopSandboxRun(runId: number, token: string): Promise<{ run_id: number; status: string }> {
  return request(`/public/sandbox/runs/${runId}/stop`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
