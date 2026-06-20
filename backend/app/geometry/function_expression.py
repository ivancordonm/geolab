"""Validation helpers for real-valued y = f(x) expressions."""

from __future__ import annotations

import re

from sympy import E, Float, Integer, Symbol, pi
from sympy.core.expr import Expr
from sympy.core.symbol import Symbol
from sympy.functions import (
    Abs,
    acos,
    acosh,
    asin,
    asinh,
    atan,
    atanh,
    ceiling,
    cos,
    cosh,
    cot,
    csc,
    exp,
    floor,
    log,
    sec,
    sign,
    sin,
    sinh,
    sqrt,
    tan,
    tanh,
)
from sympy.printing import sstr
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

_ALLOWED_SOURCE = re.compile(r"^[0-9a-zA-Z_+\-*/^().,\s=]+$")
_TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)
_X = Symbol("x", real=True)
_ALLOWED_NAMES = {
    "x": _X,
    "e": E,
    "E": E,
    "pi": pi,
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "cot": cot,
    "sec": sec,
    "csc": csc,
    "asin": asin,
    "acos": acos,
    "atan": atan,
    "sinh": sinh,
    "cosh": cosh,
    "tanh": tanh,
    "asinh": asinh,
    "acosh": acosh,
    "atanh": atanh,
    "exp": exp,
    "log": log,
    "ln": log,
    "sqrt": sqrt,
    "abs": Abs,
    "Abs": Abs,
    "floor": floor,
    "ceil": ceiling,
    "ceiling": ceiling,
    "sign": sign,
}
_SAFE_GLOBALS = {"Integer": Integer, "Float": Float, "Symbol": Symbol}


class FunctionExpressionError(ValueError):
    """Raised when a function expression uses unsupported syntax."""


def normalize_function_expression(raw: str) -> str:
    trimmed = raw.strip()
    if not trimmed:
        raise FunctionExpressionError("The function expression cannot be empty")
    if not _ALLOWED_SOURCE.fullmatch(trimmed):
        raise FunctionExpressionError("The expression contains unsupported characters")

    expression = re.sub(r"^\s*y\s*=\s*", "", trimmed, flags=re.IGNORECASE)
    if not expression:
        raise FunctionExpressionError("Write an expression for y, for example y = sin(x)")

    try:
        parsed = parse_expr(
            expression,
            local_dict=_ALLOWED_NAMES,
            global_dict=_SAFE_GLOBALS,
            transformations=_TRANSFORMATIONS,
            evaluate=True,
        )
    except Exception as exc:
        raise FunctionExpressionError("Invalid real function expression") from exc

    if not isinstance(parsed, Expr):
        raise FunctionExpressionError("Invalid real function expression")

    free_symbols = parsed.free_symbols
    if free_symbols - {_X}:
        raise FunctionExpressionError("Only the real variable x is supported")

    return sstr(parsed).replace("**", "^")
