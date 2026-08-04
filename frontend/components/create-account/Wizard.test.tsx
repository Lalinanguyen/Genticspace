import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Wizard } from "./Wizard";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const setSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: null,
    token: null,
    loading: false,
    setSession: setSessionMock,
    updateUser: vi.fn(),
    logout: vi.fn(),
  }),
}));

const requestOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const signupMock = vi.fn();
const loginMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    requestOtp: (...args: unknown[]) => requestOtpMock(...args),
    verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
    signup: (...args: unknown[]) => signupMock(...args),
    login: (...args: unknown[]) => loginMock(...args),
  };
});

beforeEach(() => {
  pushMock.mockClear();
  setSessionMock.mockClear();
  requestOtpMock.mockReset().mockResolvedValue({ status: "sent" });
  verifyOtpMock.mockReset().mockResolvedValue({ email_verified_token: "evt-token" });
  signupMock.mockReset().mockResolvedValue({
    access_token: "signup-token",
    user: { id: 1, email: "ada@example.com", name: "Ada Lovelace" },
  });
  loginMock.mockReset().mockResolvedValue({
    access_token: "login-token",
    user: { id: 1, email: "ada@example.com", name: "Ada Lovelace" },
  });
});

function clickTerms() {
  // The label text is split across two <Link> elements (Terms of Service,
  // Privacy Policy), so an exact-string matcher can't find a single text
  // node -- match on the containing <span>'s full textContent instead.
  const row = screen
    .getByText(
      (_, element) =>
        element?.tagName.toLowerCase() === "span" &&
        element.textContent === "I agree to the Terms of Service and Privacy Policy"
    )
    .parentElement!;
  fireEvent.click(row.querySelector(".cursor-pointer")!);
}

function fillIndividualDetails() {
  fireEvent.change(screen.getByPlaceholderText("Ada Lovelace"), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByPlaceholderText("ada@company.com"), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "password123" } });
  clickTerms();
}

function fillOtp(code: string) {
  const inputs = screen.getAllByRole("textbox");
  code.split("").forEach((digit, i) => fireEvent.change(inputs[i], { target: { value: digit } }));
}

describe("Wizard step progression", () => {
  it("starts on the role step", () => {
    render(<Wizard />);
    expect(screen.getByText("Create your account")).toBeInTheDocument();
  });

  it("keeps Continue inert on the details step until all required fields are filled", () => {
    render(<Wizard />);
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.click(screen.getByText("Continue")); // details step, nothing filled in yet
    expect(screen.getByText(/Create your account/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ada Lovelace")).toBeInTheDocument();
  });

  it("walks the individual path from role through to confirmation", async () => {
    render(<Wizard />);

    fireEvent.click(screen.getByText("Continue")); // role -> details
    fillIndividualDetails();
    fireEvent.click(screen.getByText("Continue")); // details -> experience
    expect(await screen.findByText(/AI experience level/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.click(screen.getByText("Continue")); // experience -> usecase
    expect(await screen.findByText(/best use case/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Continue")); // usecase -> otp (requestOtp fires)
    expect(await screen.findByText(/Verify it's you|Verify it.s you/)).toBeInTheDocument();
    expect(requestOtpMock).toHaveBeenCalledWith("ada@example.com");

    fillOtp("123456");
    fireEvent.click(screen.getByText("Verify & continue"));
    expect(await screen.findByText(/use Genticspace for/)).toBeInTheDocument();
    expect(verifyOtpMock).toHaveBeenCalledWith("ada@example.com", "123456");

    fireEvent.click(screen.getByText("Software Engineering"));
    fireEvent.click(screen.getByText("Continue")); // purpose -> profile
    expect(await screen.findByText("Set up your profile")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Finish setup"));
    expect(await screen.findByText(/You're all set, Ada/)).toBeInTheDocument();
    expect(signupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        email_verified_token: "evt-token",
        purposes: ["swe"],
      })
    );
    expect(setSessionMock).toHaveBeenCalledWith("signup-token", expect.objectContaining({ email: "ada@example.com" }));
  });

  it("business accounts skip straight from details to otp, bypassing experience/usecase", async () => {
    render(<Wizard />);

    fireEvent.click(screen.getByText("Business"));
    fireEvent.click(screen.getByText("Continue")); // role -> details (business)
    expect(await screen.findByText(/Set up your business account/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Meridian Labs"), { target: { value: "Acme Inc" } });
    fireEvent.change(screen.getByPlaceholderText("ada@company.com"), { target: { value: "biz@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "password123" } });
    clickTerms();

    fireEvent.click(screen.getByText("Continue")); // details -> otp directly
    expect(await screen.findByText(/Verify it's you|Verify it.s you/)).toBeInTheDocument();
    expect(requestOtpMock).toHaveBeenCalledWith("biz@example.com");
    // experience/usecase screens were never shown
    expect(screen.queryByText(/AI experience level/)).not.toBeInTheDocument();
  });

  it("shows an error and stays on the otp step when the code is wrong", async () => {
    verifyOtpMock.mockRejectedValueOnce(new Error("bad code"));
    render(<Wizard />);

    fireEvent.click(screen.getByText("Continue"));
    fillIndividualDetails();
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.click(screen.getByText("Continue")); // -> usecase
    fireEvent.click(screen.getByText("Continue")); // -> otp
    await screen.findByText(/Verify it's you|Verify it.s you/);

    fillOtp("000000");
    fireEvent.click(screen.getByText("Verify & continue"));

    expect(await screen.findByText("That code didn't match. Try again.")).toBeInTheDocument();
    expect(screen.getByText(/Verify it's you|Verify it.s you/)).toBeInTheDocument();
  });

  it("Back returns from details to the role step", () => {
    render(<Wizard />);
    fireEvent.click(screen.getByText("Continue")); // role -> details
    fireEvent.click(screen.getByText("← Back"));
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByText("Individual use")).toBeInTheDocument();
  });

  it("switches to the login step and back", () => {
    render(<Wizard />);
    fireEvent.click(screen.getByText("Sign in"));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Create an account"));
    expect(screen.getByText("Create your account")).toBeInTheDocument();
  });

  it("logs in successfully and redirects to the marketplace", async () => {
    render(<Wizard />);
    fireEvent.click(screen.getByText("Sign in"));

    fireEvent.change(screen.getByPlaceholderText("ada@company.com"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Your password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Sign in"));

    await vi.waitFor(() => expect(loginMock).toHaveBeenCalledWith("ada@example.com", "password123"));
    expect(setSessionMock).toHaveBeenCalledWith("login-token", expect.objectContaining({ email: "ada@example.com" }));
    expect(pushMock).toHaveBeenCalledWith("/marketplace");
  });

  it("shows an error message when login fails and does not navigate", async () => {
    loginMock.mockRejectedValueOnce(new Error("nope"));
    render(<Wizard />);
    fireEvent.click(screen.getByText("Sign in"));

    fireEvent.change(screen.getByPlaceholderText("ada@company.com"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Your password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByText("Sign in"));

    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
