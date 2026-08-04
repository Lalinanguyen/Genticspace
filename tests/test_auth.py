import jwt as pyjwt

from app.config import settings


def _signup_payload(email, token, **overrides):
    payload = {
        "email": email,
        "email_verified_token": token,
        "password": "correct-horse-battery",
        "account_type": "individual",
        "name": "Ada Lovelace",
    }
    payload.update(overrides)
    return payload


def _verify_email(client, sent_emails, email):
    client.post("/auth/request-otp", json={"email": email})
    code = sent_emails["otp"][-1][1]
    res = client.post("/auth/verify-otp", json={"email": email, "code": code})
    assert res.status_code == 200
    return res.json()["email_verified_token"]


class TestRequestAndVerifyOtp:
    def test_request_otp_sends_code_and_does_not_leak_it_in_response(self, client, sent_emails):
        res = client.post("/auth/request-otp", json={"email": "a@example.com"})
        assert res.status_code == 200
        assert res.json() == {"status": "sent"}
        assert len(sent_emails["otp"]) == 1
        email, code = sent_emails["otp"][0]
        assert email == "a@example.com"
        assert code not in res.text

    def test_verify_otp_with_no_active_code_is_rejected(self, client):
        res = client.post("/auth/verify-otp", json={"email": "nobody@example.com", "code": "123456"})
        assert res.status_code == 400

    def test_verify_otp_wrong_code_increments_attempts_then_locks_out(self, client, sent_emails):
        client.post("/auth/request-otp", json={"email": "a@example.com"})
        for _ in range(5):
            res = client.post("/auth/verify-otp", json={"email": "a@example.com", "code": "000000"})
            assert res.status_code == 400
        # 5 wrong attempts spend the budget; the 6th is locked out regardless of the code.
        res = client.post("/auth/verify-otp", json={"email": "a@example.com", "code": "000000"})
        assert res.status_code == 429

    def test_verify_otp_success_returns_token_scoped_to_email(self, client, sent_emails):
        token = _verify_email(client, sent_emails, "a@example.com")
        payload = pyjwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        assert payload["email"] == "a@example.com"
        assert payload["purpose"] == "email_verified"

    def test_verify_otp_is_single_use(self, client, sent_emails):
        client.post("/auth/request-otp", json={"email": "a@example.com"})
        code = sent_emails["otp"][-1][1]
        first = client.post("/auth/verify-otp", json={"email": "a@example.com", "code": code})
        assert first.status_code == 200
        second = client.post("/auth/verify-otp", json={"email": "a@example.com", "code": code})
        assert second.status_code == 400


class TestSignup:
    def test_signup_rejects_garbage_email_token(self, client):
        res = client.post("/auth/signup", json=_signup_payload("a@example.com", "not-a-real-token"))
        assert res.status_code == 400

    def test_signup_rejects_token_issued_for_a_different_email(self, client, sent_emails):
        token = _verify_email(client, sent_emails, "a@example.com")
        res = client.post("/auth/signup", json=_signup_payload("someone-else@example.com", token))
        assert res.status_code == 400

    def test_signup_success_returns_token_and_user_without_password_hash(self, client, sent_emails):
        token = _verify_email(client, sent_emails, "a@example.com")
        res = client.post("/auth/signup", json=_signup_payload("a@example.com", token))
        assert res.status_code == 200
        body = res.json()
        assert "access_token" in body
        assert body["user"]["email"] == "a@example.com"
        assert "password_hash" not in body["user"]

    def test_signup_rejects_duplicate_email(self, client, sent_emails):
        token = _verify_email(client, sent_emails, "a@example.com")
        first = client.post("/auth/signup", json=_signup_payload("a@example.com", token))
        assert first.status_code == 200

        token2 = _verify_email(client, sent_emails, "a@example.com")
        second = client.post("/auth/signup", json=_signup_payload("a@example.com", token2))
        assert second.status_code == 409


class TestLogin:
    def _sign_up(self, client, sent_emails, email="a@example.com", password="correct-horse-battery"):
        token = _verify_email(client, sent_emails, email)
        res = client.post("/auth/signup", json=_signup_payload(email, token, password=password))
        assert res.status_code == 200
        return res.json()

    def test_login_with_correct_credentials_succeeds(self, client, sent_emails):
        self._sign_up(client, sent_emails)
        res = client.post("/auth/login", json={"email": "a@example.com", "password": "correct-horse-battery"})
        assert res.status_code == 200
        assert "access_token" in res.json()

    def test_login_with_wrong_password_fails(self, client, sent_emails):
        self._sign_up(client, sent_emails)
        res = client.post("/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
        assert res.status_code == 401

    def test_login_with_unknown_email_fails(self, client):
        res = client.post("/auth/login", json={"email": "ghost@example.com", "password": "whatever1"})
        assert res.status_code == 401


class TestMe:
    def test_me_requires_bearer_token(self, client):
        res = client.get("/auth/me")
        assert res.status_code == 401

    def test_me_rejects_invalid_token(self, client):
        res = client.get("/auth/me", headers={"Authorization": "Bearer garbage"})
        assert res.status_code == 401

    def test_me_returns_current_user_for_valid_token(self, client, sent_emails):
        token = _verify_email(client, sent_emails, "a@example.com")
        signup_res = client.post("/auth/signup", json=_signup_payload("a@example.com", token))
        access_token = signup_res.json()["access_token"]

        res = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert res.status_code == 200
        assert res.json()["email"] == "a@example.com"


class TestPasswordReset:
    def _sign_up(self, client, sent_emails, email="a@example.com", password="correct-horse-battery"):
        token = _verify_email(client, sent_emails, email)
        client.post("/auth/signup", json=_signup_payload(email, token, password=password))

    def test_forgot_password_for_unknown_email_does_not_reveal_that(self, client, sent_emails):
        res = client.post("/auth/forgot-password", json={"email": "ghost@example.com"})
        assert res.status_code == 200
        assert res.json() == {"status": "sent"}
        assert sent_emails["reset"] == []

    def test_forgot_password_for_known_email_sends_reset_link(self, client, sent_emails):
        self._sign_up(client, sent_emails)
        res = client.post("/auth/forgot-password", json={"email": "a@example.com"})
        assert res.status_code == 200
        assert len(sent_emails["reset"]) == 1

    def test_reset_password_rejects_short_passwords(self, client):
        res = client.post("/auth/reset-password", json={"token": "whatever", "new_password": "short"})
        assert res.status_code == 400

    def test_reset_password_rejects_an_unissued_token(self, client):
        res = client.post("/auth/reset-password", json={"token": "not-issued", "new_password": "longenough1"})
        assert res.status_code == 400

    def _get_reset_token(self, client, sent_emails, email="a@example.com"):
        client.post("/auth/forgot-password", json={"email": email})
        reset_link = sent_emails["reset"][-1][1]
        return reset_link.split("token=")[1]

    def test_reset_password_success_changes_the_password(self, client, sent_emails):
        self._sign_up(client, sent_emails)
        reset_token = self._get_reset_token(client, sent_emails)

        res = client.post("/auth/reset-password", json={"token": reset_token, "new_password": "new-password-1"})
        assert res.status_code == 200

        old = client.post("/auth/login", json={"email": "a@example.com", "password": "correct-horse-battery"})
        assert old.status_code == 401

        new = client.post("/auth/login", json={"email": "a@example.com", "password": "new-password-1"})
        assert new.status_code == 200

    def test_reset_password_token_is_single_use(self, client, sent_emails):
        self._sign_up(client, sent_emails)
        reset_token = self._get_reset_token(client, sent_emails)

        first = client.post("/auth/reset-password", json={"token": reset_token, "new_password": "new-password-1"})
        assert first.status_code == 200
        second = client.post("/auth/reset-password", json={"token": reset_token, "new_password": "another-pass-1"})
        assert second.status_code == 400
