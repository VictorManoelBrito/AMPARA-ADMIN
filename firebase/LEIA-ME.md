# AMPARA – Configuração do Firebase

Passos para ativar o login do administrador, as regras de segurança e as notificações.

## 1. Criar o administrador (obrigatório para entrar no painel)

O painel agora usa **Firebase Authentication**. O login fixo `admin` / `123456` foi removido.

1. No [Console do Firebase](https://console.firebase.google.com), abra o projeto **ampara-fbb95**.
2. Vá em **Authentication → Users → Add user**. Informe o e-mail e a senha do administrador.
3. Copie o **User UID** do usuário criado.
4. Vá em **Firestore Database → Iniciar coleção**:
   - ID da coleção: `administradores`
   - ID do documento: **cole o UID copiado**
   - Campos:
     | Campo | Tipo | Valor |
     |---|---|---|
     | `nome` | string | Seu nome |
     | `email` | string | e-mail do admin |
     | `nivelAcesso` | string | `total` |
     | `ativo` | boolean | `true` |
5. Abra o `index.html` do painel e entre com esse e-mail e essa senha.

> Um usuário do aplicativo que tentar entrar no painel recebe "Acesso negado", porque não está na coleção `administradores`.

## 2. Regras de segurança do Firestore

Faça este passo **depois** de criar o administrador.

1. **Firestore Database → Regras**.
2. Apague o conteúdo atual, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
3. Teste: o app (login, denúncia, quiz, rede de apoio) e o painel (denúncias, rede de apoio, usuários, relatórios).

O que as regras garantem:
- O usuário só lê as **próprias** denúncias identificadas. Denúncias anônimas não ficam ligadas a ninguém.
- Só o administrador altera o status de uma denúncia, cadastra a rede de apoio e ativa/desativa contas.
- O usuário não consegue reativar a própria conta (o campo `ativo` só muda pelo admin).
- Cada usuário só vê o próprio progresso no quiz.

## 3. Notificações (Firebase Cloud Messaging)

### 3.1 Avisos para todos os usuários (gratuito)
Todo aparelho com o app entra no tópico **`geral`**.
1. **Console → Messaging → Criar primeira campanha → Mensagens do Firebase Notifications**.
2. Escreva o título e o texto → **Destino: Tópico** → `geral` → **Publicar**.
3. A notificação chega mesmo com o app fechado.

### 3.2 Aviso automático quando o status da denúncia muda
Com o app **aberto**, o aviso já funciona. Para funcionar com o app **fechado**, publique a Cloud Function em `functions/index.js`:

1. Ative o plano **Blaze** no Firebase. Ele tem cota gratuita mensal, mas pede cartão.
2. Instale o Node.js 20 e, no terminal, dentro desta pasta `firebase`:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use ampara-fbb95
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
3. Teste: no painel, mude o status de uma denúncia **identificada** e feche o app no celular. A notificação deve chegar.

> Se o deploy reclamar da **região**, a Function precisa estar na mesma região do seu Firestore. Veja a região em Firestore → Configurações e acrescente `region: "<região>"` no `onDocumentUpdated`.
