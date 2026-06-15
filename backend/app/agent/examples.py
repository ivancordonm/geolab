"""Deterministic coordinates and naming conventions for planner examples."""

DEFAULT_POINT_COORDINATES: tuple[tuple[float, float], ...] = (
    (0.0, 0.0),
    (5.0, 0.0),
    (2.0, 3.0),
    (1.0, 2.0),
    (-2.0, 2.0),
)


def format_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else str(value)

