import logging
import smtplib
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def _send(to: str, subject: str, body: str, log_fallback: str) -> None:
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured — %s", log_fallback)
        return

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM
    message["To"] = to

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM, [to], message.as_string())


def send_otp_email(email: str, code: str) -> None:
    _send(
        email,
        "Your Genticspace verification code",
        f"Your Genticspace verification code is {code}. It expires in 10 minutes.",
        f"OTP for {email} is {code}",
    )


def send_password_reset_email(email: str, reset_link: str) -> None:
    _send(
        email,
        "Reset your Genticspace password",
        f"Someone requested a password reset for this account. If this was you, "
        f"reset your password here (expires in 30 minutes):\n\n{reset_link}\n\n"
        f"If you didn't request this, you can ignore this email.",
        f"password reset link for {email} is {reset_link}",
    )


def send_contact_email(from_email: str, topic: str, message_text: str) -> None:
    if not settings.CONTACT_INBOX:
        logger.info("CONTACT_INBOX not configured — contact message from %s: %s", from_email, message_text)
        return
    _send(
        settings.CONTACT_INBOX,
        f"[Genticspace contact] {topic or 'General'} — {from_email}",
        f"From: {from_email}\nTopic: {topic or 'General'}\n\n{message_text}",
        f"contact message from {from_email}",
    )


def send_outreach_email(email: str, repo_url: str, terms_summary: str) -> None:
    """Repo Completion consent outreach (app/services/repo_consent.py). Same
    _send() fallback as every other function here -- with SMTP_HOST unset,
    this logs instead of sending, which is this pipeline's mock sender for
    now rather than a separate test-mode flag."""
    _send(
        email,
        "Genticspace would like to use code from your repository",
        f"Hi,\n\nGenticspace is an AI agent marketplace. A contributor's in-progress "
        f"project would benefit from code in your repository ({repo_url}), and we'd "
        f"like your permission to use it.\n\nProposed terms: {terms_summary}\n\n"
        f"If you're interested, reply to this email and we'll follow up with the "
        f"details and a consent form to sign. If you're not interested, no action "
        f"is needed and we won't use your code.",
        f"outreach email for {repo_url} to {email}: {terms_summary}",
    )
