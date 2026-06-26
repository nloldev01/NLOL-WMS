"""
Pure, generic pass/fail engine for First Fill Test results. Written once and
shared by every report format (Engine Oil COA, Grease COA, ...) — adding a
format or changing a limit is a data change (TestDefinitionParameter rows),
never a change to this function.
"""
from decimal import Decimal, InvalidOperation


def parse_numeric_result(raw_text, value_type):
    """
    Parse a raw result string into a comparable Decimal.
    Strips a leading '<' or '>' for bounded values (e.g. "<2.5" -> 2.5).
    Returns None when the value can't be parsed as a number (pure text,
    or a rating like "1b") — callers should treat that as manual/NA.
    """
    if raw_text is None:
        return None
    text = str(raw_text).strip()
    if not text:
        return None
    if value_type == 'text':
        return None
    if text[0] in ('<', '>'):
        text = text[1:].strip()
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def compute_verdict(spec_type, min_value, max_value, result_numeric, value_type):
    """
    spec_type: 'Report' | 'Min' | 'Max' | 'Range'
    Returns 'Pass' | 'Fail' | 'NA'.
    """
    if spec_type == 'Report':
        return 'NA'
    if value_type == 'text':
        return 'NA'  # qualitative — set manually
    if result_numeric is None:
        return 'NA'
    if spec_type == 'Min':
        return 'Pass' if min_value is not None and result_numeric >= min_value else 'Fail'
    if spec_type == 'Max':
        return 'Pass' if max_value is not None and result_numeric <= max_value else 'Fail'
    if spec_type == 'Range':
        return 'Pass' if (min_value is not None and max_value is not None
                           and min_value <= result_numeric <= max_value) else 'Fail'
    return 'NA'


def compute_overall_verdict(result_rows):
    """
    result_rows: iterable of objects/dicts with 'verdict' and 'mandatory'.
    Conforms unless a mandatory row Fails; Pending if nothing's been entered yet.
    """
    rows = list(result_rows)
    if not rows:
        return 'pending'
    has_mandatory_fail = any(
        (r['verdict'] if isinstance(r, dict) else r.verdict) == 'Fail'
        and (r['mandatory'] if isinstance(r, dict) else r.mandatory)
        for r in rows
    )
    return 'non_conforming' if has_mandatory_fail else 'conforms'
