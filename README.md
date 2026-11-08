# Margem — meus estudos

App de anotações de estudo:

- **Anotações separadas por curso**: cada curso tem cor, lista própria e busca.
- **Vocabulário universal**: um glossário único, não ligado a nenhum curso, em ordem alfabética.
- **Rascunho automático**: o que você digita é guardado sozinho até tocar em "Salvar anotação".
- **Backup**: copiar todos os dados e importar em outra versão do app.

## Arquivos

- `index.html`: estrutura da página
- `style.css`: visual
- `app.js`: funcionamento
- `firebase-config.js`: chaves do projeto Firebase `meusestudosremasol`
- `firestore.rules`: regras de segurança do Firestore
- `favicon.svg`: ícone do app

## Onde os dados ficam

Firestore, em `users/{uid}/itens/{id}`, com login Google. Cada pessoa só vê os próprios dados.

## Configurar o Firebase (uma vez)

1. **Authentication > Método de login**: ativar **Google**.
2. **Firestore Database**: criar o banco (modo produção, região `southamerica-east1`).
3. **Firestore > Regras**: colar o conteúdo de `firestore.rules` e publicar.
4. **Configurações do projeto > Seus apps**: adicionar um **App da Web** e copiar o `firebaseConfig` para `firebase-config.js`.
5. **Authentication > Configurações > Domínios autorizados**: adicionar `renatarollemberg.github.io` se for publicar pelo GitHub Pages.
