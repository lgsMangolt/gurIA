# Avisos de terceiros

A gurIA começou como uma adaptação do [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC). Os arquivos abaixo foram copiados ou adaptados dele e continuam sob a licença MIT do projeto original. Cada um traz no topo o cabeçalho "Adaptado do OpenMAIC (MIT)".

## Arquivos copiados do OpenMAIC

| Arquivo na gurIA | Origem no OpenMAIC | O que mudou |
|---|---|---|
| `lib/study/capped-stream.ts` | `lib/server/capped-stream.ts` | Nada (só o cabeçalho). |
| `lib/study/web/ssrf-guard.ts` | `lib/server/ssrf-guard.ts` | Nada (só o cabeçalho). |
| `lib/study/web/pinned-dispatcher.ts` | `lib/server/pinned-dispatcher.ts` | Importa o `ssrf-guard` copiado. |
| `lib/study/web/fetch-page.ts` | `lib/web-fetch/builtin-extraction.ts` | Sem leitura de PDF e sem o portão de URL das sessões de agente; o resto (limite de bytes, prazo, DNS fixado, checagem a cada redirecionamento, recusa de captcha) é o mesmo. |
| `tests/study/ssrf-guard.test.ts` | `tests/server/ssrf-guard.test.ts` | Aponta para a cópia. |

### Licença do OpenMAIC

```
MIT License

Copyright (c) 2026 THU-MAIC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Pacotes usados pelas cópias

Estes pacotes estão no `package.json` da gurIA por causa das cópias acima:

| Pacote | Usado em | Licença |
|---|---|---|
| `@mozilla/readability` | `fetch-page.ts` | Apache-2.0 |
| `linkedom` | `fetch-page.ts` | ISC |
| `turndown` | `fetch-page.ts` | MIT |
| `@joplin/turndown-plugin-gfm` | `fetch-page.ts` | MIT |
| `undici` | `fetch-page.ts`, `pinned-dispatcher.ts` | MIT |
| `ipaddr.js` | `ssrf-guard.ts` | MIT |

## Outros componentes de terceiros servidos pela gurIA

| Componente | Onde | Licença |
|---|---|---|
| three.js (r160) | `public/study/network-3d/three.module.js` | MIT, em `public/study/network-3d/LICENSE-three.txt` |
| GitHub Octicons 19.42.0 | `public/study/icons/*.svg` | MIT, em `public/study/icons/LICENSE` |

As demais dependências (Next.js, React, zod, pg, o SDK do MCP e as ferramentas de desenvolvimento) são instaladas pelo npm e trazem a própria licença em `node_modules`; nenhuma é copiada para o repositório.
