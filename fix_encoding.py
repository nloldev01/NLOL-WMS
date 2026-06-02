import os

pages_dir = r"c:/NLOL WMS/frontend/src/pages"

# Every string is written with \uXXXX Python unicode escapes — unambiguous at any encoding.
replacements = [
    # Garbled x (close button): Ã (U+00C3) + em-dash (U+2014) -> times (U+00D7)
    ("Ã—", "×"),

    # Garbled em-dash, variant A (3rd char = right-double-quote U+201D): -> U+2014
    ("â€”", "—"),

    # Garbled en-dash, variant B (3rd char = left-double-quote U+201C): -> U+2013
    ("â€“", "–"),

    # Garbled em-dash, variant C (3rd char = ascii quote U+0022): -> U+2014
    ("â€"", "—"),

    # Garbled prev-page button (3rd char = superscript-1 U+00B9): -> single-left-angle U+2039
    ("â€¹", "‹"),

    # Garbled next-page button (3rd char = masculine-ordinal U+00BA): -> single-right-angle U+203a
    ("â€º", "›"),

    # Garbled middle-dot: Â (U+00C2) + middle-dot (U+00B7) -> middle-dot (U+00B7)
    ("Â·", "·"),

    # Garbled approx-equal: U+00E2 + U+2030 + U+02C6 -> U+2248
    ("â‰ˆ", "≈"),
]

files_to_fix = [
    "FinishedProductMovementPage.jsx",
    "FinishedProductsPage.jsx",
    "FinishedProductStockPage.jsx",
    "PackagingOrdersPage.jsx",
    "ProductStockPage.jsx",
]

for fname in files_to_fix:
    fpath = os.path.join(pages_dir, fname)
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()
    original = content
    for frm, to in replacements:
        content = content.replace(frm, to)
    if content != original:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed: {fname}")
    else:
        print(f"No changes: {fname}")

print("Done.")
