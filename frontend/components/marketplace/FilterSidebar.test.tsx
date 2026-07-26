import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterSidebar } from "./FilterSidebar";

const pushMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/marketplace",
  useSearchParams: () => currentSearchParams,
}));

beforeEach(() => {
  pushMock.mockClear();
  currentSearchParams = new URLSearchParams();
});

describe("FilterSidebar URL query-param sync", () => {
  it("sets a boolean param when a chip is turned on", () => {
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText("Verified"));
    expect(pushMock).toHaveBeenCalledWith("/marketplace?verified=true");
  });

  it("removes the param when an active boolean chip is turned back off", () => {
    currentSearchParams = new URLSearchParams("verified=true");
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText("✓ Verified"));
    expect(pushMock).toHaveBeenCalledWith("/marketplace?");
  });

  it("strips the page param whenever a filter changes", () => {
    currentSearchParams = new URLSearchParams("page=3");
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText("Safe to transact"));
    const pushedUrl = pushMock.mock.calls[0][0] as string;
    expect(pushedUrl).not.toContain("page=3");
    expect(pushedUrl).toContain("safe_only=true");
  });

  it("writes the selected trust tier to the URL", () => {
    render(<FilterSidebar />);
    fireEvent.change(screen.getByDisplayValue("Any tier"), { target: { value: "onchain" } });
    expect(pushMock).toHaveBeenCalledWith("/marketplace?trust_tier=onchain");
  });

  it("clearing the trust tier back to empty removes the param", () => {
    currentSearchParams = new URLSearchParams("trust_tier=onchain");
    render(<FilterSidebar />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(pushMock).toHaveBeenCalledWith("/marketplace?");
  });

  it("adds the first value to a comma-joined list param", () => {
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText("Healthcare"));
    expect(pushMock).toHaveBeenCalledWith("/marketplace?industry=Healthcare");
  });

  it("appends to an existing comma-joined list param", () => {
    currentSearchParams = new URLSearchParams("industry=Healthcare");
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText("Legal"));
    expect(pushMock).toHaveBeenCalledWith("/marketplace?industry=Healthcare%2CLegal");
  });

  it("removes just that value from an existing list param", () => {
    currentSearchParams = new URLSearchParams("industry=Healthcare,Legal");
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText("Healthcare"));
    expect(pushMock).toHaveBeenCalledWith("/marketplace?industry=Legal");
  });

  it("marks an industry chip active when its value is present in the URL", () => {
    currentSearchParams = new URLSearchParams("industry=Healthcare");
    render(<FilterSidebar />);
    expect(screen.getByText("Healthcare").className).toContain("border-cyan");
    expect(screen.getByText("Legal").className).not.toContain("border-cyan");
  });

  it("syncs license and deployment filters from the More filters panel", () => {
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText(/More filters/));

    fireEvent.click(screen.getByText("Open Source"));
    expect(pushMock).toHaveBeenLastCalledWith("/marketplace?license=Open+Source");

    fireEvent.click(screen.getByText("Cloud"));
    expect(pushMock).toHaveBeenLastCalledWith("/marketplace?deployment=Cloud");
  });

  it("Clear navigates to the bare pathname, dropping every param", () => {
    currentSearchParams = new URLSearchParams("verified=true&industry=Healthcare");
    render(<FilterSidebar />);
    fireEvent.click(screen.getByText("Clear"));
    expect(pushMock).toHaveBeenCalledWith("/marketplace");
  });

  it("hides Clear when no filter is active", () => {
    render(<FilterSidebar />);
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
  });
});
