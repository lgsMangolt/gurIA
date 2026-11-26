# Contribuindo com a gurIA

A gurIA é um beta pessoal, mantido por uma pessoa só. Sugestões e correções são bem-vindas, mas mudanças grandes começam por uma conversa: abra uma *issue* descrevendo o problema ou a ideia antes de escrever código.

## Preparando o ambiente

Siga [docs/guia/instalacao.md](docs/guia/instalacao.md). Em resumo: Node.js 22.19+, npm, Docker Desktop aberto, `npm ci`, `npm run db:up` e `npm run dev`.

Para testar sem tocar nos seus dados de estudo, use a demo isolada (banco na porta 5441, app na 3034, dados fictícios):

```powershell
npm run demo
```

## Antes de abrir um pull request

```powershell
npm test
npm run typecheck
npm run build
```

Se a mudança mexe na tela, rode também os roteiros da demo (`npm run e2e:skills` e depois `npm run e2e:praticar`, porque o Praticar altera os dados; ressemeie com `npm run demo` entre eles).

- Escreva o teste antes da correção sempre que der.
- Textos da interface e da documentação em português brasileiro.
- Formate só os arquivos que você mexeu (`npx prettier --write <arquivo>`).
- Nada de chaves de API, `.env.local`, dados reais de estudo ou caminhos pessoais nos commits.
- Testes que chamam IA de verdade consomem a cota de quem roda; deixe-os opcionais e use dados sintéticos.

## Licença

Ao contribuir, você concorda que sua contribuição fica sob a licença MIT do projeto ([LICENSE](LICENSE)). Código copiado de outros projetos precisa manter o aviso de licença original e entrar em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
