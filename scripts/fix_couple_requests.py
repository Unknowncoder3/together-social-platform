from pathlib import Path

p = Path('client/src/couple-widget.js')
text = p.read_text()
start = text.index('const renderConnect=()=>{')
end = text.index('const renderHome=()=>{', start)
block = text[start:end]

if 'const incoming=state?.incoming||[];' not in block:
    block = block.replace(
        'const renderConnect=()=>{',
        'const renderConnect=()=>{const incoming=state?.incoming||[];const outgoing=state?.outgoing||[];'
    )
    marker = '<div id=\\"coupleConnectBox\\"></div>`;'
    pending = '''${incoming.length?`<div class=\\"bondingGate\\"><h3>💌 Couple request waiting</h3><p class=\\"coupleMeta\\">Someone wants to connect with you as a partner.</p>${incoming.map(r=>`<div class=\\"listItem\\"><span><b>${esc(r.user?.name||'Someone')}</b><small>${esc(r.user?.email||'')}</small></span><div style=\\"display:flex;gap:8px\\"><button class=\\"couplePrimary\\" data-accept=\\"${r.id}\\">Accept ❤️</button><button class=\\"coupleSubtle\\" data-reject=\\"${r.id}\\">Decline</button></div></div>`).join('')}</div>`:''}${outgoing.length?`<div class=\\"roomInfo\\">⏳ Waiting for ${esc(outgoing[0]?.user?.name||'them')} to accept your couple request.</div>`:''}<div id=\\"coupleConnectBox\\"></div>`;'''
    if marker not in block:
        raise SystemExit('coupleConnectBox marker not found')
    block = block.replace(marker, pending, 1)
    if not block.rstrip().endswith('};'):
        raise SystemExit('unexpected renderConnect ending')
    block = block.rstrip()[:-2] + "panel.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{try{await api('/api/couple/request/'+b.dataset.accept+'/accept',{method:'POST'});await render()}catch(e){alert(e.message)}});panel.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{try{await api('/api/couple/request/'+b.dataset.reject+'/reject',{method:'POST'});await render()}catch(e){alert(e.message)}})};\n"
    text = text[:start] + block + text[end:]
    p.write_text(text)
    print('patched couple-widget.js')
else:
    print('already patched')
