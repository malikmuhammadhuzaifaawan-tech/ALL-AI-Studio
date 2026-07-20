from cryptography.fernet import Fernet, InvalidToken

from backend.core.config import settings


class SecretDecryptionError(RuntimeError):
    """Raised when a persisted secret cannot be decrypted."""


def _cipher() -> Fernet:
    settings.encryption_key_path.parent.mkdir(parents=True, exist_ok=True)
    if not settings.encryption_key_path.exists():
        settings.encryption_key_path.write_bytes(Fernet.generate_key())
    return Fernet(settings.encryption_key_path.read_bytes())


def encrypt_secret(value: str) -> str:
    return _cipher().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return _cipher().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise SecretDecryptionError(
            "Saved API key cannot be decrypted. Reconfigure this provider."
        ) from exc
