from pathlib import Path

path = Path('client/src/main.jsx')
text = path.read_text()

start = text.find("    s.on(\n      'room:users',\n      users\n    )")
if start == -1:
    raise SystemExit('room listener block not found')
end_marker = "        'room:reaction',\n        react\n      );"
end = text.find(end_marker, start)
if end == -1:
    raise SystemExit('room listener block end not found')
end += len(end_marker)
block = text[start:end]

text = text[:start] + text[end:]
anchor = "    (async () => {\n"
insert_at = text.find(anchor)
if insert_at == -1:
    raise SystemExit('media bootstrap anchor not found')
text = text[:insert_at] + block + "\n\n" + text[insert_at:]

path.write_text(text)
print('moved room/WebRTC listeners before getUserMedia')
