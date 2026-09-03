import ast
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from .codebase_index_artifacts import normalize_rel_path
from .codebase_index_config import build_ignore_matcher


@dataclass
class GraphNodeRecord:
    id: str
    type: str
    name: str
    path: str
    labels: List[str] = field(default_factory=list)
    properties: Dict[str, Any] = field(default_factory=dict)
    relations: Dict[str, Set[str]] = field(default_factory=dict)


def iter_python_files(codebase_root: str, ignored_paths: List[str]) -> List[Tuple[str, str]]:
    files: List[Tuple[str, str]] = []
    ignore_match = build_ignore_matcher(ignored_paths)
    for root, dirs, filenames in os.walk(codebase_root):
        rel_dir = os.path.relpath(root, codebase_root)
        if rel_dir == ".":
            rel_dir = ""
        normalized_dir = normalize_rel_path(rel_dir) if rel_dir else ""
        dir_prefix = normalized_dir + "/" if normalized_dir else ""
        kept_dirs: List[str] = []
        for dirname in dirs:
            if dirname in (".git", ".venv", "__pycache__"):
                continue
            rel_path = dir_prefix + dirname + "/"
            if ignore_match(rel_path):
                continue
            kept_dirs.append(dirname)
        dirs[:] = kept_dirs
        for filename in filenames:
            if not filename.endswith(".py"):
                continue
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, codebase_root)
            rel_path_norm = normalize_rel_path(rel_path)
            if ignore_match(rel_path_norm):
                continue
            files.append((full_path, rel_path_norm))
    return files


def ensure_node(
    nodes_by_id: Dict[str, GraphNodeRecord],
    node_id: str,
    node_type: str,
    name: str,
    path: str,
    extra_labels: Optional[List[str]] = None,
) -> GraphNodeRecord:
    node = nodes_by_id.get(node_id)
    if node:
        return node
    labels = [node_type]
    if extra_labels:
        for label in extra_labels:
            if label not in labels:
                labels.append(label)
    record = GraphNodeRecord(id=node_id, type=node_type, name=name, path=path, labels=labels)
    nodes_by_id[node_id] = record
    return record


def add_relation(nodes_by_id: Dict[str, GraphNodeRecord], source_id: str, label: str, target_id: str) -> None:
    source = nodes_by_id.get(source_id)
    if not source:
        return
    relation_map = source.relations.setdefault(label, set())
    relation_map.add(target_id)


def build_symbol_index(nodes_by_id: Dict[str, GraphNodeRecord]) -> Dict[str, str]:
    index: Dict[str, str] = {}
    for node in nodes_by_id.values():
        kind = node.type
        props = node.properties
        module = str(props.get("module") or "")
        qualname = str(props.get("qualname") or "")
        simple_name = str(props.get("name") or node.name)
        if kind in ("Function", "Class"):
            if simple_name and simple_name not in index:
                index[simple_name] = node.id
            if qualname and qualname not in index:
                index[qualname] = node.id
            if module and simple_name:
                key = module + "." + simple_name
                if key not in index:
                    index[key] = node.id
    return index


def extract_calls(node: ast.AST) -> List[str]:
    calls: List[str] = []

    class Visitor(ast.NodeVisitor):
        def visit_Call(self, call: ast.Call) -> None:
            name = ""
            func = call.func
            if isinstance(func, ast.Name):
                name = func.id
            elif isinstance(func, ast.Attribute):
                parts: List[str] = []
                current: Any = func
                while isinstance(current, ast.Attribute):
                    parts.append(current.attr)
                    current = current.value
                if isinstance(current, ast.Name):
                    parts.append(current.id)
                    parts.reverse()
                    name = ".".join(parts)
            if name:
                calls.append(name)
            self.generic_visit(call)

    Visitor().visit(node)
    return calls


def build_code_graph(codebase_root: str, ignored_paths: List[str]) -> Dict[str, GraphNodeRecord]:
    nodes_by_id: Dict[str, GraphNodeRecord] = {}
    py_files = iter_python_files(codebase_root, ignored_paths)
    for full_path, rel_path in py_files:
        module_path = rel_path[:-3] if rel_path.endswith(".py") else rel_path
        dotted_module = module_path.replace("/", ".")
        file_id = rel_path
        file_name = os.path.basename(rel_path)
        file_node = ensure_node(nodes_by_id, file_id, "File", file_name, rel_path)
        file_node.properties["module"] = dotted_module
        try:
            with open(full_path, "r", encoding="utf-8") as handle:
                source = handle.read()
        except Exception:
            continue
        try:
            tree = ast.parse(source, filename=rel_path)
        except Exception:
            continue
        for top in tree.body:
            if isinstance(top, ast.ClassDef):
                class_name = top.name
                class_id = rel_path + "::class:" + class_name
                qualname = dotted_module + "." + class_name
                class_node = ensure_node(nodes_by_id, class_id, "Class", class_name, rel_path)
                class_node.properties["module"] = dotted_module
                class_node.properties["qualname"] = qualname
                class_node.properties["name"] = class_name
                bases: List[str] = []
                for base in top.bases:
                    if isinstance(base, ast.Name):
                        bases.append(base.id)
                    elif isinstance(base, ast.Attribute):
                        parts: List[str] = []
                        current: Any = base
                        while isinstance(current, ast.Attribute):
                            parts.append(current.attr)
                            current = current.value
                        if isinstance(current, ast.Name):
                            parts.append(current.id)
                            parts.reverse()
                            bases.append(".".join(parts))
                if bases:
                    class_node.properties["bases"] = bases
                add_relation(nodes_by_id, file_id, "contains", class_id)
                for member in top.body:
                    if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        fn_name = member.name
                        fn_id = rel_path + "::method:" + class_name + "." + fn_name
                        fn_qualname = qualname + "." + fn_name
                        fn_node = ensure_node(nodes_by_id, fn_id, "Function", fn_name, rel_path)
                        fn_node.properties["module"] = dotted_module
                        fn_node.properties["qualname"] = fn_qualname
                        fn_node.properties["name"] = fn_name
                        fn_node.properties["kind"] = "method"
                        fn_node.properties["class"] = class_name
                        add_relation(nodes_by_id, class_id, "contains", fn_id)
            elif isinstance(top, (ast.FunctionDef, ast.AsyncFunctionDef)):
                fn_name = top.name
                fn_id = rel_path + "::function:" + fn_name
                fn_qualname = dotted_module + "." + fn_name
                fn_node = ensure_node(nodes_by_id, fn_id, "Function", fn_name, rel_path)
                fn_node.properties["module"] = dotted_module
                fn_node.properties["qualname"] = fn_qualname
                fn_node.properties["name"] = fn_name
                fn_node.properties["kind"] = "function"
                add_relation(nodes_by_id, file_id, "contains", fn_id)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for imported_name in node.names:
                    module_name = imported_name.name
                    target_id = "module:" + module_name
                    module_node = ensure_node(nodes_by_id, target_id, "Module", module_name, "")
                    module_node.properties["module"] = module_name
                    add_relation(nodes_by_id, file_id, "imports", target_id)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module_name = node.module
                    target_id = "module:" + module_name
                    module_node = ensure_node(nodes_by_id, target_id, "Module", module_name, "")
                    module_node.properties["module"] = module_name
                    add_relation(nodes_by_id, file_id, "imports", target_id)
        symbol_index = build_symbol_index(nodes_by_id)
        for top in tree.body:
            if isinstance(top, (ast.FunctionDef, ast.AsyncFunctionDef)):
                fn_name = top.name
                fn_id = rel_path + "::function:" + fn_name
                calls = extract_calls(top)
                for call_name in calls:
                    target_node_id = symbol_index.get(call_name)
                    if not target_node_id:
                        qualified_name = dotted_module + "." + call_name
                        target_node_id = symbol_index.get(qualified_name)
                    if target_node_id:
                        add_relation(nodes_by_id, fn_id, "calls", target_node_id)
            elif isinstance(top, ast.ClassDef):
                class_name = top.name
                for member in top.body:
                    if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        fn_name = member.name
                        fn_id = rel_path + "::method:" + class_name + "." + fn_name
                        calls = extract_calls(member)
                        for call_name in calls:
                            target_node_id = symbol_index.get(call_name)
                            if not target_node_id:
                                qualified_name = dotted_module + "." + call_name
                                target_node_id = symbol_index.get(qualified_name)
                            if target_node_id:
                                add_relation(nodes_by_id, fn_id, "calls", target_node_id)
    return nodes_by_id
