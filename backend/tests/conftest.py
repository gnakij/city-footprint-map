import uuid


_uuid_counter = 0


def deterministic_uuid4() -> uuid.UUID:
    global _uuid_counter
    _uuid_counter += 1
    return uuid.UUID(int=_uuid_counter)


def pytest_configure() -> None:
    uuid.uuid4 = deterministic_uuid4
