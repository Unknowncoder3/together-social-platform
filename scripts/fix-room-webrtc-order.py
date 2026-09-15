from pathlib import Path

path = Path('client/src/main.jsx')
text = path.read_text()

listener_start = text.find("    s.on(\n      'room:users',\n      users\n    )")
if listener_start == -1:
    raise SystemExit('listener block not found')
listener_end_marker = "        'room:reaction',\n        react\n      );"
listener_end = text.find(listener_end_marker, listener_start)
if listener_end == -1:
    raise SystemExit('listener block end not found')
listener_end += len(listener_end_marker)
listener_block = text[listener_start:listener_end]
text = text[:listener_start] + text[listener_end:]

async_start = text.find("    (async () => {\n")
if async_start == -1:
    raise SystemExit('media bootstrap block not found')
async_end_marker = "    })();"
async_end = text.find(async_end_marker, async_start)
if async_end == -1:
    raise SystemExit('media bootstrap end not found')
async_end += len(async_end_marker)
async_block = text[async_start:async_end]
text = text[:async_start] + text[async_end:]

insert_anchor = "    return () => {\n"
insert_at = text.find(insert_anchor)
if insert_at == -1:
    raise SystemExit('cleanup anchor not found')
insert = listener_block + "\n\n" + async_block + "\n\n"
text = text[:insert_at] + insert + text[insert_at:]

path.write_text(text)
print('ordered handlers before listener registration and media bootstrap')
