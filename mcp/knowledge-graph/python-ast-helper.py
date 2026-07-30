#!/usr/bin/env python3
"""Bounded stdin/stdout bridge for deterministic Python stdlib AST facts."""

import ast
import json
import sys
from typing import Any, Dict, List, Optional


def python_version_info() -> List[Any]:
    return [
        int(sys.version_info.major),
        int(sys.version_info.minor),
        int(sys.version_info.micro),
        str(sys.version_info.releaselevel),
        int(sys.version_info.serial),
    ]


def position(node: ast.AST) -> Dict[str, int]:
    return {
        "lineStart": int(getattr(node, "lineno", 1) or 1),
        "lineEnd": int(getattr(node, "end_lineno", getattr(node, "lineno", 1)) or 1),
        "columnStart": int(getattr(node, "col_offset", 0) or 0) + 1,
        "columnEnd": int(getattr(node, "end_col_offset", getattr(node, "col_offset", 0)) or 0) + 1,
    }


def expression_name(node: Optional[ast.AST]) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = expression_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    if isinstance(node, ast.Call):
        return expression_name(node.func)
    if isinstance(node, ast.Subscript):
        return expression_name(node.value)
    try:
        return ast.unparse(node).strip()[:200] if node is not None else ""
    except Exception:
        return ""


class FactVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.scope: List[str] = []
        self.declarations: List[Dict[str, Any]] = []
        self.imports: List[Dict[str, Any]] = []
        self.calls: List[Dict[str, Any]] = []
        self.inherits: List[Dict[str, Any]] = []

    def owner(self) -> str:
        return ".".join(self.scope)

    def add_declaration(self, node: ast.AST, name: str, kind: str) -> str:
        qualified_name = ".".join([*self.scope, name])
        self.declarations.append({"name": name, "qualifiedName": qualified_name, "kind": kind, **position(node)})
        return qualified_name

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        qualified_name = self.add_declaration(node, node.name, "class")
        for base in node.bases:
            name = expression_name(base)
            if name:
                self.inherits.append({"owner": qualified_name, "target": name, "kind": "extends", **position(base)})
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        kind = "method" if self.scope and any(item["qualifiedName"] == self.owner() and item["kind"] == "class" for item in self.declarations) else "function"
        self.add_declaration(node, node.name, kind)
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.visit_FunctionDef(node)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.imports.append({"module": alias.name, **position(node)})

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = str(node.module or "")
        base = "." * int(node.level or 0) + module
        for alias in node.names:
            imported = (
                f"{base}.{alias.name}"
                if module and alias.name != "*"
                else f"{base}{alias.name}" if not module and alias.name != "*" else base or alias.name
            )
            self.imports.append({"module": imported, **position(node)})

    def visit_Call(self, node: ast.Call) -> None:
        target = expression_name(node.func)
        if target:
            self.calls.append({"owner": self.owner(), "target": target, **position(node.func)})
        self.generic_visit(node)


def main() -> int:
    request = json.load(sys.stdin)
    source = str(request.get("text") or "")
    source_path = str(request.get("sourcePath") or "source.py")
    try:
        tree = ast.parse(source, filename=source_path, type_comments=True)
    except SyntaxError as error:
        json.dump({
            "pythonVersionInfo": python_version_info(),
            "declarations": [],
            "imports": [],
            "calls": [],
            "inherits": [],
            "diagnostics": [{
                "code": "python_syntax_error",
                "message": str(error.msg or "Python syntax error"),
                "lineStart": int(error.lineno or 1),
                "lineEnd": int(error.end_lineno or error.lineno or 1),
                "columnStart": int(error.offset or 1),
                "columnEnd": int(error.end_offset or error.offset or 1),
            }],
        }, sys.stdout, sort_keys=True)
        return 0
    visitor = FactVisitor()
    visitor.visit(tree)
    payload = {
        "pythonVersionInfo": python_version_info(),
        "declarations": sorted(visitor.declarations, key=lambda item: (item["lineStart"], item["columnStart"], item["qualifiedName"])),
        "imports": sorted(visitor.imports, key=lambda item: (item["lineStart"], item["columnStart"], item["module"])),
        "calls": sorted(visitor.calls, key=lambda item: (item["lineStart"], item["columnStart"], item["target"])),
        "inherits": sorted(visitor.inherits, key=lambda item: (item["lineStart"], item["columnStart"], item["target"])),
        "diagnostics": [],
    }
    json.dump(payload, sys.stdout, sort_keys=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
