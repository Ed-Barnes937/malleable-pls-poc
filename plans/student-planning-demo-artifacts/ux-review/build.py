import base64, re, pathlib
d = pathlib.Path('/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Genio-playground-malleable-plc-poc/9f0cbd4c-0ede-44d9-98ef-b18f3c7d2260/scratchpad/t12')
t = (d / 'report.tpl.html').read_text()
t = t.replace('a warm, light illustration-free empty state', 'a warm empty state with no illustration')
def sub(m):
    b = (d / 'jpg' / (m.group(1) + '.jpg')).read_bytes()
    return 'data:image/jpeg;base64,' + base64.b64encode(b).decode()
out = re.sub(r'\{\{([a-z0-9-]+)\}\}', sub, t)
(d / 'student-planner-ux-review.html').write_text(out)
print(len(out), 'missing' if '{{' in out else 'ok', '—' in out)
