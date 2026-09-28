"""assets/ 폴더의 CSS·JS를 각 HTML 안에 그대로 넣는다.
HTML 파일 하나만 옮기거나 폴더 위치를 바꿔도 동작하게 하려는 것.
assets/ 파일을 고친 뒤(또는 build_catalog.py를 돌린 뒤) 실행: python tools/inline.py
"""
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'assets'

def read(name):
    return (A / name).read_text(encoding='utf-8')

def safe_js(text):
    return text.replace('</script', '<\\/script').replace('<!--', '<\\!--')

def catalog_js(slim):
    raw = read('catalog.js')
    data = json.loads(raw.split('window.VC_CATALOG=', 1)[1].strip().rstrip(';'))
    if slim:  # 세트 화면에는 채점·백업에 필요한 필드만
        data['items'] = [{k: q[k] for k in ('n', 's', 'a', 'o', 'c', 'r') if k in q} for q in data['items']]
    return 'window.VC_CATALOG=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';'

GUARD = ("<script data-inline=\"guard\">window.addEventListener('error',function(e){try{var b=document.getElementById('loadError');"
         "if(!b){b=document.createElement('div');b.id='loadError';b.setAttribute('role','alert');"
         "b.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99;padding:12px 14px;background:#fbe9e6;color:#1a2233;border-left:3px solid #cf2a1f;font:14px/1.5 sans-serif';"
         "document.body.appendChild(b);}b.textContent='화면 기능을 불러오지 못했습니다. 새로고침해 보고, 계속되면 이 문구를 캡처해 보내 주세요. ('+(e.message||'알 수 없는 오류')+')';}catch(_){}});</script>")

def block(tag, key, body):
    return f'<{tag} data-inline="{key}">{body}</{tag}>'

def put(html, tag, key, body, anchor):
    pat = re.compile(rf'<{tag} data-inline="{re.escape(key)}">.*?</{tag}>', re.S)
    new = block(tag, key, body)
    if pat.search(html):
        return pat.sub(lambda m: new, html, count=1)
    return html.replace(anchor, new + '\n' + anchor, 1)

def build(path):
    html = path.read_text(encoding='utf-8')
    study = path.name.startswith('set-')
    # 예전 외부 참조 제거
    html = re.sub(r'<link rel="stylesheet" href="assets/style\.css[^"]*">\n?', '', html)
    html = re.sub(r'<script src="assets/[a-z]+\.js[^"]*" defer></script>\n?', '', html)
    html = put(html, 'style', 'style.css', read('style.css'), '</head>')
    html = put(html, 'script', 'guard', '', '</head>') if 'data-inline="guard"' not in html else html
    html = re.sub(r'<script data-inline="guard"></script>', GUARD, html)
    end = '<script>window.SET=' if study else '</body>'
    html = put(html, 'script', 'catalog.js', catalog_js(study), end)
    html = put(html, 'script', 'core.js', safe_js(read('core.js')), end)
    html = put(html, 'script', 'app.js' if study else 'home.js', safe_js(read('app.js' if study else 'home.js')), '</body>')
    path.write_text(html, encoding='utf-8')

if __name__ == '__main__':
    pages = [ROOT / 'index.html'] + sorted(ROOT.glob('set-[0-9][0-9].html'))
    for p in pages:
        build(p)
    print(f'{len(pages)}개 페이지에 CSS·JS를 넣었습니다.')
