from pathlib import Path

path = Path('client/src/main.jsx')
text = path.read_text()

needle = "  const pcs = useRef({});\n"
if needle not in text:
    raise SystemExit('pcs ref not found')
text = text.replace(needle, needle + "  const joinedRoom = useRef(false);\n", 1)

old = "    const onConnect = () => {\n      setConnected(true);\n      s.emit('room:join', room.id);\n    };\n\n    const onDisconnect = () => setConnected(false);"
new = "    const joinRoom = () => {\n      if (!s.connected || joinedRoom.current) return;\n      joinedRoom.current = true;\n      s.emit('room:join', room.id);\n    };\n\n    const onConnect = () => {\n      setConnected(true);\n      if (stream.current) joinRoom();\n    };\n\n    const onDisconnect = () => {\n      setConnected(false);\n      joinedRoom.current = false;\n    };"
if old not in text:
    raise SystemExit('connect handlers not found')
text = text.replace(old, new, 1)

old2 = "      if (s.connected) {\n        s.emit('room:join', room.id);\n      }"
if old2 not in text:
    raise SystemExit('room join after media not found')
text = text.replace(old2, "      joinRoom();", 1)

path.write_text(text)
print('room join now waits for local media and is idempotent')
