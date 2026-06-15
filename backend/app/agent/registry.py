"""Schema-validated registry for deterministic agent tools."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping

from pydantic import BaseModel, ValidationError

from app.agent.models import ToolDescriptor


class ToolRegistryError(ValueError):
    """Base error for registry lookup, input, or execution failures."""


class UnknownToolError(ToolRegistryError):
    pass


class InvalidToolInputError(ToolRegistryError):
    def __init__(self, tool_name: str, errors: list[dict[str, Any]]) -> None:
        super().__init__(f"Invalid arguments for tool '{tool_name}'")
        self.tool_name = tool_name
        self.errors = errors


class ToolExecutionError(ToolRegistryError):
    pass


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    name: str
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    mutates_geometry_state: bool
    handler: Callable[[BaseModel], BaseModel]

    def descriptor(self) -> ToolDescriptor:
        return ToolDescriptor(
            name=self.name,
            description=self.description,
            input_schema=self.input_model.model_json_schema(by_alias=True),
            output_schema=self.output_model.model_json_schema(by_alias=True),
            mutates_geometry_state=self.mutates_geometry_state,
        )


class ToolRegistry:
    """Registers typed handlers and validates every call before execution."""

    def __init__(self) -> None:
        self._definitions: dict[str, ToolDefinition] = {}

    @property
    def definitions(self) -> Mapping[str, ToolDefinition]:
        return MappingProxyType(self._definitions)

    def register(self, definition: ToolDefinition) -> None:
        if definition.name in self._definitions:
            raise ToolRegistryError(f"Tool '{definition.name}' is already registered")
        self._definitions[definition.name] = definition

    def descriptors(self) -> tuple[ToolDescriptor, ...]:
        return tuple(definition.descriptor() for definition in self._definitions.values())

    def execute(self, tool_name: str, arguments: dict[str, Any]) -> tuple[ToolDefinition, BaseModel]:
        definition = self._definitions.get(tool_name)
        if definition is None:
            raise UnknownToolError(f"Unknown tool '{tool_name}'")
        try:
            validated_input = definition.input_model.model_validate(arguments)
        except ValidationError as error:
            raise InvalidToolInputError(tool_name, error.errors(include_url=False)) from error

        try:
            raw_output = definition.handler(validated_input)
            output = definition.output_model.model_validate(raw_output)
        except ToolRegistryError:
            raise
        except (ValueError, TypeError) as error:
            raise ToolExecutionError(str(error)) from error
        return definition, output

