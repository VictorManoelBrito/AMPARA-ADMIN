// =============================================================
// AMPARA - Painel Administrativo
// Administradores (cadastro 2.1.1 / entidade administrador).
// Coleção: "administradores/{uid}" (nome, email, nivelAcesso, ativo)
//
// Para criar a conta (Firebase Authentication) sem deslogar o administrador
// atual, usamos uma segunda instância do Firebase apenas para o cadastro.
// =============================================================

(function () {
  const COLECAO = "administradores";

  const listaView = document.getElementById("adminsListaView");
  const formView = document.getElementById("adminsFormView");
  const tabela = document.getElementById("adminsTableBody");
  const form = document.getElementById("adminForm");
  const erro = document.getElementById("adminFormErro");
  const btnSalvar = document.getElementById("adminSalvar");

  let admins = [];
  let pararEscuta = null;
  let appCadastro = null;

  function instanciaCadastro() {
    if (!appCadastro) {
      appCadastro = firebase.initializeApp(firebaseConfig, "cadastroAdmin");
    }
    return appCadastro.auth();
  }

  function ativo(dados) {
    return dados.ativo !== false;
  }

  function renderizar() {
    const meuUid = window.amparaAdmin ? window.amparaAdmin.uid : null;

    if (!admins.length) {
      tabela.innerHTML = `<tr><td colspan="5">Nenhum administrador encontrado.</td></tr>`;
      return;
    }

    tabela.innerHTML = admins
      .map(({ id, dados }) => {
        const estaAtivo = ativo(dados);
        const souEu = id === meuUid;
        const acao = souEu
          ? `<span class="texto-muted">Você</span>`
          : `<button class="${estaAtivo ? "danger-btn" : "success-btn small-btn"}" data-id="${id}" data-ativar="${!estaAtivo}" type="button">${estaAtivo ? "Desativar" : "Ativar"}</button>`;
        return `
          <tr>
            <td>${escaparHtml(dados.nome || "—")}</td>
            <td>${escaparHtml(dados.email || "—")}</td>
            <td>${escaparHtml(dados.nivelAcesso || "total")}</td>
            <td><span class="badge ${estaAtivo ? "badge-ativo" : "badge-desativado"}">${estaAtivo ? "Ativo" : "Inativo"}</span></td>
            <td>${acao}</td>
          </tr>`;
      })
      .join("");
  }

  function iniciarEscuta() {
    if (pararEscuta) return;
    pararEscuta = window.firebaseDb.collection(COLECAO).onSnapshot(
      (snapshot) => {
        admins = snapshot.docs
          .map((doc) => ({ id: doc.id, dados: doc.data() }))
          .sort((a, b) => (a.dados.nome || "").localeCompare(b.dados.nome || "", "pt-BR"));
        renderizar();
      },
      (e) => {
        console.error("Erro ao buscar administradores:", e);
        pararEscuta = null;
        tabela.innerHTML = `<tr><td colspan="5" class="erro-tabela">${
          e.code === "permission-denied"
            ? "Sem permissão para listar os administradores. Publique as regras atualizadas (firebase/firestore.rules) no Console do Firebase e recarregue a página."
            : "Não foi possível carregar os administradores. Verifique a conexão e recarregue a página."
        }</td></tr>`;
      }
    );
  }

  function abrirFormulario() {
    form.reset();
    erro.textContent = "";
    listaView.classList.add("hidden");
    formView.classList.remove("hidden");
    document.getElementById("adminNome").focus();
  }

  function fecharFormulario() {
    form.reset();
    formView.classList.add("hidden");
    listaView.classList.remove("hidden");
  }

  function mensagemErro(codigo) {
    switch (codigo) {
      case "auth/email-already-in-use":
        return "Já existe uma conta com esse e-mail. Use outro e-mail para o administrador.";
      case "auth/invalid-email":
        return "E-mail em formato inválido.";
      case "auth/weak-password":
        return "Senha muito fraca. Use pelo menos 8 caracteres.";
      case "auth/network-request-failed":
        return "Sem conexão com o Firebase.";
      default:
        return `Não foi possível criar o administrador (${codigo || "erro desconhecido"}).`;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    erro.textContent = "";

    const nome = document.getElementById("adminNome").value.trim();
    const email = document.getElementById("adminEmail").value.trim();
    const senha = document.getElementById("adminSenha").value;
    const senha2 = document.getElementById("adminSenha2").value;
    const nivelAcesso = document.getElementById("adminNivel").value;

    if (!nome) return (erro.textContent = "Informe o nome.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (erro.textContent = "Informe um e-mail válido.");
    if (senha.length < 8) return (erro.textContent = "A senha deve ter pelo menos 8 caracteres.");
    if (senha !== senha2) return (erro.textContent = "As senhas não conferem.");

    btnSalvar.disabled = true;
    btnSalvar.textContent = "Criando...";

    const authCadastro = instanciaCadastro();
    try {
      // 1) Cria a conta no Firebase Authentication (instância separada)
      const credencial = await authCadastro.createUserWithEmailAndPassword(email, senha);
      const uid = credencial.user.uid;
      await authCadastro.signOut();

      // 2) Registra como administrador (gravado pelo admin logado)
      await window.firebaseDb.collection(COLECAO).doc(uid).set({
        nome,
        email,
        nivelAcesso,
        ativo: true,
        dataCadastro: firebase.firestore.FieldValue.serverTimestamp()
      });

      mostrarMensagem(`Administrador ${nome} criado. Ele já pode entrar no painel.`);
      fecharFormulario();
    } catch (e) {
      console.error("Erro ao criar administrador:", e);
      try { await authCadastro.signOut(); } catch (_) { /* ignora */ }
      erro.textContent = e.code && e.code.startsWith("auth/")
        ? mensagemErro(e.code)
        : "A conta foi criada, mas não foi possível registrá-la como administrador. Verifique as regras do Firestore.";
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Criar administrador";
    }
  });

  tabela.addEventListener("click", async (event) => {
    const botao = event.target.closest("button[data-id]");
    if (!botao) return;

    const ativar = botao.dataset.ativar === "true";
    const alvo = admins.find((a) => a.id === botao.dataset.id);
    if (!alvo) return;

    if (!ativar) {
      const ativos = admins.filter((a) => ativo(a.dados)).length;
      if (ativos <= 1) {
        mostrarMensagem("Não é possível desativar o último administrador ativo.", "error");
        return;
      }
      if (!confirm(`Desativar "${alvo.dados.nome || alvo.dados.email}"? Ele não conseguirá mais entrar no painel.`)) return;
    }

    try {
      await window.firebaseDb.collection(COLECAO).doc(alvo.id).update({ ativo: ativar });
      mostrarMensagem(ativar ? "Administrador ativado." : "Administrador desativado.");
    } catch (e) {
      console.error("Erro ao alterar administrador:", e);
      mostrarMensagem("Não foi possível alterar o administrador.", "error");
    }
  });

  document.getElementById("btnNovoAdmin").addEventListener("click", abrirFormulario);
  document.getElementById("adminCancelar").addEventListener("click", fecharFormulario);

  document.addEventListener("ampara:pagina", (e) => {
    if (e.detail === "admins") {
      fecharFormulario();
      iniciarEscuta();
    }
  });

  document.addEventListener("ampara:logout", () => {
    if (pararEscuta) pararEscuta();
    pararEscuta = null;
    admins = [];
  });
})();
