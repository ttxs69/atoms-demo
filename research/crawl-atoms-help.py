import re, json, time, os, urllib.request

URLS = open('/tmp/atoms_en_urls.txt').read().strip().split('\n')
OUT = '/tmp/atoms/clean'
RAW = '/tmp/atoms/raw'
os.makedirs(OUT, exist_ok=True)
os.makedirs(RAW, exist_ok=True)


def fetch(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')


def rsc_stream(h):
    chunks = []
    pat = re.compile(r'self\.__next_f\.push\(\[1,(".*?")\]\)</script>', re.S)
    for m in pat.finditer(h):
        try:
            chunks.append(json.loads(m.group(1)))
        except Exception:
            pass
    return ''.join(chunks)


def get_tchunk(stream, key):
    """RSC text chunk format:  \\nKEY:T<hexlen>,<payload of hexlen BYTES>"""
    m = re.search(r'(?:^|\n)' + re.escape(key) + r':T([0-9a-f]+),', stream)
    if not m:
        return None
    n = int(m.group(1), 16)
    b = stream[m.end():].encode('utf-8')[:n]
    return b.decode('utf-8', errors='replace')


def jstr(s):
    return json.loads('"' + s + '"')


META_RE = re.compile(
    r'"articleSlug":"([^"]*)","path":"([^"]*)",'
    r'"title":"((?:[^"\\]|\\.)*)","summary":"((?:[^"\\]|\\.)*)",'
    r'"updatedAt":"([^"]*)","markdown":"\$(\w+)"')

INLINE_RE = re.compile(r'"markdown":"((?:[^"\\]|\\.)+)","relatedArticles"')


def extract(h):
    s = rsc_stream(h)
    m = META_RE.search(s)
    if m:
        meta = dict(slug=m.group(1), path=m.group(2), title=jstr(m.group(3)),
                    summary=jstr(m.group(4)), updated=m.group(5))
        md = get_tchunk(s, m.group(6))
        if md:
            return meta, md
    else:
        meta = {}
    m2 = INLINE_RE.search(s)
    if m2:
        try:
            return meta, jstr(m2.group(1))
        except Exception:
            pass
    return meta, None


fails = []
for i, url in enumerate(URLS):
    slug = url.rstrip('/').split('/')[-1]
    rp = os.path.join(RAW, slug + '.html')
    if os.path.exists(rp):
        h = open(rp, encoding='utf-8', errors='replace').read()
    else:
        h = fetch(url)
        open(rp, 'w').write(h)
        time.sleep(0.25)
    meta, md = extract(h)
    if not md:
        fails.append(slug)
        print('[%d] FAIL %s' % (i + 1, slug))
        continue
    hdr = ('# %s\n\n- Source: %s\n- Summary: %s\n- Updated: %s\n\n---\n\n'
           % (meta.get('title', slug), url, meta.get('summary', ''), meta.get('updated', '')))
    open(os.path.join(OUT, slug + '.md'), 'w').write(hdr + md.strip() + '\n')
    print('[%d] ok %s (%dc) %s' % (i + 1, slug, len(md), meta.get('title', '')))

print('\nfails: %r' % (fails,))
