const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const ADMIN_KEY_STORAGE = "tracent_admin_key";

export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getStoredAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setStoredAdminKey(key: string): void {
  window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearStoredAdminKey(): void {
  window.localStorage.removeItem(ADMIN_KEY_STORAGE);
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getStoredAdminKey();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-API-Key": key } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) clearStoredAdminKey();
    throw new AdminApiError(res.status, body.detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AdminStats {
  total_agents: number;
  verified_count: number;
  flagged_count: number;
  index_state: { source: string; last_indexed_block: number | null }[];
}

export function getAdminStats(): Promise<AdminStats> {
  return adminRequest("/admin/stats");
}

export interface AdminReview {
  id: number;
  tracent_id: string;
  agent_name: string | null;
  user_id: number;
  author_name: string | null;
  rating: number;
  text: string | null;
  created_at: string;
}

export function listAdminReviews(): Promise<{ reviews: AdminReview[] }> {
  return adminRequest("/admin/reviews");
}

export function deleteAdminReview(reviewId: number): Promise<{ status: string; review_id: number }> {
  return adminRequest(`/admin/reviews/${reviewId}`, { method: "DELETE" });
}

export interface ReputationFlag {
  id: number;
  tracent_id: string;
  agent_name: string | null;
  flag_type: string;
  severity: string;
  detail: string | null;
  flagged_at: string;
}

export function listReputationFlags(): Promise<{ flags: ReputationFlag[] }> {
  return adminRequest("/admin/flags");
}

export function resolveFlag(flagId: number): Promise<{ status: string; flag_id: number }> {
  return adminRequest(`/admin/flags/${flagId}`, { method: "DELETE" });
}

export interface VerificationRequest {
  id: number;
  tracent_id: string;
  agent_name: string | null;
  requester_email: string;
  status: string;
  reviewer_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export function listVerificationRequests(): Promise<{ verification_requests: VerificationRequest[] }> {
  return adminRequest("/admin/verification-requests");
}

export function reviewVerificationRequest(
  tracentId: string,
  action: "approve" | "reject",
  reviewerNote?: string
): Promise<{ request_id: number; action: string; status: string }> {
  return adminRequest(`/admin/verify/${tracentId}`, {
    method: "POST",
    body: JSON.stringify({ action, reviewer_note: reviewerNote }),
  });
}

export interface AdminListing {
  tracent_id: string;
  name: string | null;
  description: string | null;
  is_active: boolean;
  verified: boolean;
  trust_tier: string | null;
  risk_score: number;
  submitted_by: number;
  submitted_by_email: string;
  first_seen: string;
}

export function listAdminListings(): Promise<{ listings: AdminListing[] }> {
  return adminRequest("/admin/listings");
}

export function unpublishListing(tracentId: string): Promise<{ status: string; tracent_id: string }> {
  return adminRequest(`/admin/listings/${tracentId}/unpublish`, { method: "POST" });
}

export function deleteListing(tracentId: string): Promise<{ status: string; tracent_id: string }> {
  return adminRequest(`/admin/listings/${tracentId}`, { method: "DELETE" });
}

export interface SandboxCohortEntry {
  tracent_id: string;
  agent_name: string | null;
  status: string;
  admitted_by: string;
  admitted_at: string;
  manifest_path: string | null;
}

export function listSandboxCohort(): Promise<{ sandbox_cohort: SandboxCohortEntry[] }> {
  return adminRequest("/admin/sandbox");
}

export function disableSandboxEntry(tracentId: string): Promise<{ tracent_id: string; status: string }> {
  return adminRequest(`/admin/sandbox/${tracentId}/disable`, { method: "POST" });
}
