# Margem — meus estudos

App de anotações de estudo:

- **Anotações separadas por curso**: cada curso tem cor, lista própria e busca.
- **Vocabulário universal**: um glossário único, não ligado a nenhum curso, em ordem alfabética.
- **Rascunho automático**: o que você digita é guardado sozinho até tocar em "Salvar anotação".

## Arquivos

- `index.html`: estrutura da página
- `style.css`: visual
- `app.js`: funcionamento

## Onde os dados ficam

Hoje o app roda como artifact no Claude e salva os dados na conta Claude.
Aberto fora do Claude, ele salva só no navegador (localStorage).
Próximo passo: salvar no Firebase (Firestore + login Google) para funcionar em qualquer navegador.
