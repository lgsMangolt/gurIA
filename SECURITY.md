# Segurança da gurIA

## Como a gurIA se protege

A gurIA foi feita para rodar só no seu computador:

- o servidor liga em `127.0.0.1` e o portão (`proxy.ts`) recusa qualquer outro host;
- pedidos que gravam dados precisam vir da própria página (cabeçalho `Origin` igual ao `Host`);
- o banco PostgreSQL só escuta na interface local (`127.0.0.1`);
- a importação de páginas da web bloqueia endereços locais e privados;
- os recursos de IA usam o Codex ou o Claude já autenticados na máquina, sem chaves de API guardadas pela gurIA.

Expor a gurIA na rede (outra máquina, túnel, proxy reverso) não é suportado.

## Versões com correção

Só a versão mais recente da branch principal recebe correções de segurança.

## Como relatar uma vulnerabilidade

**Não abra uma *issue* pública.** Use o relato privado do GitHub: na aba **Security** do repositório, escolha **Advisories** e depois **Report a vulnerability**.

Inclua, se puder:

- o que a falha permite e quem é afetado;
- passos para reproduzir;
- registros, capturas ou trechos de código relevantes (sem dados pessoais);
- uma sugestão de correção, se tiver.

Como o projeto é mantido por uma pessoa só, a resposta pode levar alguns dias.
