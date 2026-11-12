from pathlib import Path
import json
root=Path('public/study/logos');root.mkdir(exist_ok=True)
models=[
{'id':'laco','name':'Laço','idea':'Duas ideias se encontram. Conexão e conversa em um símbolo simples.','color':'#555555','mark':'''<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"><path d="M49 33 38 22a19 19 0 0 0-27 27l14 14a19 19 0 0 0 27 0l10-10"/><path d="m43 63 11 11a19 19 0 0 0 27-27L67 33a19 19 0 0 0-27 0L30 43"/></g>'''},
{'id':'monograma','name':'g de gur','idea':'O g vira um caminho contínuo: aprender, revisar e seguir em frente.','color':'#555555','mark':'''<g fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M71 28v39c0 16-10 23-24 23-9 0-15-3-20-8"/><circle cx="46" cy="44" r="25"/><path d="m70 27 9-8"/></g>'''},
{'id':'companheiro','name':'gur, o companheiro','idea':'Um rosto dentro de um balão. Próximo, simpático e pronto para conversar.','color':'#555555','mark':'''<path d="M18 19h56a15 15 0 0 1 15 15v29a15 15 0 0 1-15 15H49L28 94V78H18A15 15 0 0 1 3 63V34a15 15 0 0 1 15-15Z" fill="currentColor"/><g fill="#fff"><rect x="25" y="37" width="7" height="12" rx="3.5"/><rect x="60" y="37" width="7" height="12" rx="3.5"/></g><path d="M36 58q10 10 20 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'''},
{'id':'assinatura','name':'Só a palavra','idea':'gur em primeiro plano; IA como assinatura. Direto e fácil de reconhecer.','color':'#707070','mark':None}
]
font='Segoe UI,Arial,sans-serif'
def wordmark(m,x=134,y=105,size=90):
 if m['id']=='assinatura':
  return f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="750" letter-spacing="-5" fill="#232323">gur<tspan fill="{m["color"]}">IA</tspan></text><path d="M{x+5} {y+14}h{int(size*1.37)}" stroke="{m["color"]}" stroke-width="5" stroke-linecap="round"/>'
 return f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="750" letter-spacing="-5" fill="#232323">gur<tspan fill="{m["color"]}">IA</tspan></text>'
def group(m):
 if m['mark']: return '<g transform="translate(22 22)" color="'+m['color']+'">'+m['mark']+'</g>'+wordmark(m)
 return wordmark(m,90,108,106)
for m in models:
 svg='<svg xmlns="http://www.w3.org/2000/svg" width="520" height="160" viewBox="0 0 520 160" role="img" aria-label="gurIA — '+m['name']+'"><title>gurIA — '+m['name']+'</title>'+group(m)+'</svg>'
 (root/(m['id']+'.svg')).write_text(svg,encoding='utf-8')
 if m['mark']:
  icon='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="-8 -5 112 112"><g color="'+m['color']+'">'+m['mark']+'</g></svg>'
 else:icon='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="30" fill="'+m['color']+'"/><text x="32" y="91" font-family="Segoe UI,Arial" font-size="90" font-weight="700" fill="#fff">g</text></svg>'
 (root/(m['id']+'-icone.svg')).write_text(icon,encoding='utf-8')
board=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1120" viewBox="0 0 1440 1120"><rect width="1440" height="1120" fill="#f4f4f4"/><g font-family="Segoe UI,Arial,sans-serif"><text x="64" y="72" font-size="18" fill="#626262" letter-spacing="3">EXPLORAÇÕES DE IDENTIDADE / 01</text><text x="64" y="144" font-size="64" font-weight="700" letter-spacing="-3" fill="#232323">Um gur. Quatro jeitos de se apresentar.</text><text x="64" y="188" font-size="22" fill="#626262">gurIA · o nome é gur; a brincadeira está no IA.</text>']
for i,m in enumerate(models):
 x=64+(i%2)*672;y=236+(i//2)*398
 board.append(f'<rect x="{x}" y="{y}" width="640" height="366" rx="20" fill="#fff" stroke="#dedede"/><text x="{x+32}" y="{y+46}" font-size="14" letter-spacing="2" fill="#626262">0{i+1} / {m["name"].upper()}</text><g transform="translate({x+46} {y+84})">{group(m)}</g>')
 desc={'laco':['Conexão entre ideias.','Símbolo abstrato, simples e versátil.'],'monograma':['O g como caminho de aprendizagem.','Bom para ícone do app e avatar.'],'companheiro':['Um gur com quem conversar.','A opção mais acolhedora e expressiva.'],'assinatura':['O nome resolve a identidade.','Minimalista, direto e legível.']}[m['id']]
 for j,line in enumerate(desc):board.append(f'<text x="{x+32}" y="{y+292+j*30}" font-size="20" fill="#626262">{line}</text>')
board.append('<text x="64" y="1080" font-size="17" fill="#626262">Propostas vetoriais · fundo transparente nos arquivos individuais · escolha por número para refinar</text></g></svg>')
(root/'comparativo.svg').write_text(''.join(board),encoding='utf-8')
html='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>gurIA · Modelos de logo</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f4f4;color:#232323;font:16px/1.6 'Segoe UI',Arial,sans-serif}main{max-width:1440px;margin:auto;padding:48px 32px}h1{font-size:clamp(32px,5vw,56px);letter-spacing:-.04em;line-height:1.1;margin:16px 0}p{color:#626262;max-width:65ch}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin:40px 0}.card{border:1px solid #dedede;border-radius:20px;background:#fff;padding:32px}.logo{width:100%;height:auto;display:block;margin:32px 0}.small{display:flex;gap:16px;align-items:center}.small img{width:32px;height:32px}.small .app{width:64px;height:64px;padding:8px;background:#f4f4f4;border-radius:16px}a{color:#555555}h2{font-size:22px;margin:0}.download{display:inline-block;margin:20px 16px 0 0;padding:8px 16px;border:1px solid #dedede;border-radius:8px;text-decoration:none}a:focus-visible{outline:3px solid #555555;outline-offset:4px}@media(max-width:700px){main{padding:24px 16px}.grid{grid-template-columns:1fr}.card{padding:24px}}</style><main><a href="/study">← Voltar ao app</a><p>EXPLORAÇÕES DE IDENTIDADE</p><h1>Um gur. Quatro jeitos de se apresentar.</h1><p>gurIA combina o nome gur, a inteligência artificial e a brincadeira com “guria” no Sul. As propostas abaixo exploram diferentes personalidades para a mesma marca.</p><div class="grid">'''
for i,m in enumerate(models):
 html+=f'<section class="card"><h2>0{i+1} · {m["name"]}</h2><img class="logo" src="{m["id"]}.svg" alt="Modelo {m["name"]}: gurIA"><p>{m["idea"]}</p><div class="small"><img class="app" src="{m["id"]}-icone.svg" alt="Ícone do aplicativo"><img src="{m["id"]}-icone.svg" alt="Ícone em tamanho pequeno"><span>Ícone e avatar</span></div><a class="download" href="{m["id"]}.svg" download>Baixar logo SVG</a><a class="download" href="{m["id"]}-icone.svg" download>Baixar ícone SVG</a></section>'
html+='</div><p>Os modelos são propostas para escolha; o logo atual do app continua disponível enquanto você compara.</p><a href="comparativo.svg" class="download">Abrir prancha comparativa</a></main></html>'
(root/'index.html').write_text(html,encoding='utf-8')
(root/'README.md').write_text('Quatro propostas vetoriais originais para gurIA. SVGs transparentes com tipografia de sistema; converter texto em curvas antes da produção gráfica final. Fonte de criação: scripts/generate-guria-logos.py. Não representam pesquisa de disponibilidade de marca.\n',encoding='utf-8')
print('Created 4 wordmarks, 4 icons and comparison board.')
