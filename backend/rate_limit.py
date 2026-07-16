from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def reset_rate_limits() -> None:
    limiter.reset()
