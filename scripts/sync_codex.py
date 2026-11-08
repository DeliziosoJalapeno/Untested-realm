"""Re-sync codex_dump.md from the official codex (sorcerytcg.com/codex).

Every codex page streams the WHOLE codex in its Next.js RSC payload, so one page is enough.
Usage: python scripts/sync_codex.py [out=codex_dump.md] [saved-page.html]
"""
import json
import re
import sys
import urllib.request

CODEX_PAGE = 'https://sorcerytcg.com/codex/a5c6422f-a641-4eb2-8f5b-874729c4da16'  # "At Rest"
out = sys.argv[1] if len(sys.argv) > 1 else 'codex_dump.md'
if len(sys.argv) > 2:
    html = open(sys.argv[2], encoding='utf-8').read()
else:
    req = urllib.request.Request(CODEX_PAGE, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req, timeout=60).read().decode('utf-8')

# the page streams its data as self.__next_f.push([1,"<json string>"]) chunks
chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html)
payload = ''.join(json.loads(c) for c in chunks)


def codex_docs(payload: str):
    """every codex document in the payload ({"_createdAt":…,"_type":"codex",…}), decoded whole with
    raw_decode. Each document is streamed more than once; dedupe by _id."""
    dec = json.JSONDecoder()
    seen = set()
    for m in re.finditer(re.escape('{"_createdAt"'), payload):
        try:
            obj, _ = dec.raw_decode(payload, m.start())
        except ValueError:
            continue
        if isinstance(obj, dict) and obj.get('_type') == 'codex' and obj.get('_id') not in seen:
            seen.add(obj.get('_id'))
            yield obj


def block_text(block) -> str:
    """Portable Text block → markdown-ish line"""
    if not isinstance(block, dict) or block.get('_type') != 'block':
        return ''
    text = ''.join(ch.get('text', '') for ch in block.get('children', []) if isinstance(ch, dict))
    if block.get('listItem'):
        indent = '  ' * (max(1, block.get('level', 1)) - 1)
        return f'{indent}- {text}'
    style = block.get('style', 'normal')
    if style.startswith('h') and style[1:].isdigit():
        return '#' * min(6, int(style[1:]) + 2) + ' ' + text
    return text


def is_blocks(v) -> bool:
    return isinstance(v, list) and bool(v) and isinstance(v[0], dict) and v[0].get('_type') == 'block'


def blocks_text(blocks) -> str:
    return '\n'.join(block_text(b) for b in blocks).strip()


entries = {}
for doc in codex_docs(payload):
    title = doc.get('title')
    if not isinstance(title, str):
        continue
    parts = [blocks_text(v) for v in doc.values() if is_blocks(v)]
    # sub-entries (Ward's Further Notes, Element's Air/Earth/Fire/Water) are `subcodex` objects: each
    # becomes its own ## entry (so it can be looked up by name) and is listed under its parent
    subs = []
    for v in doc.values():
        if not isinstance(v, list) or is_blocks(v):
            continue
        for sub in v:
            if not isinstance(sub, dict) or not isinstance(sub.get('title'), str):
                continue
            body = '\n'.join(blocks_text(x) for x in sub.values() if is_blocks(x))
            if body:
                subs.append(sub['title'])
                text = f'_(part of: {title})_\n\n{body}'
                if len(text) > len(entries.get(sub['title'], '')):
                    entries[sub['title']] = text
    if subs:
        parts.append('See also: ' + ', '.join(subs))
    text = '\n\n'.join(p for p in parts if p)
    if len(text) > len(entries.get(title, '')):
        entries[title] = text

with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('# Sorcery codex (sorcerytcg.com/codex)\n\n')
    for title in sorted(entries, key=str.lower):
        f.write(f'## {title}\n\n{entries[title]}\n\n')
print(len(entries), 'entries')
