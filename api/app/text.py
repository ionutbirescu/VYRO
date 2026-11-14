def escape_like(text: str) -> str:
    """Escape LIKE wildcards in user input; pass escape="\\" to ilike()."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
