// =============================================================
// AMPARA - Painel Administrativo
// Usuários (3.1.19): visualizar usuários do app e ativar/desativar contas.
// Coleção: "Usuarios" (campos: nome, email, telefone, dataCadastro, ativo)
// =============================================================

(function () {
  const tabela = document.getElementById("usuariosTableBody");
  const busca = document.getElementById("usuariosSearch");
  const filtroStatus = document.getElementById("usuariosFiltroStatus");

  let usuarios = [];
  let pararEscuta = null;

  function ativo(dados) {
    return dados.ativo !== false; // cadastros antigos, sem o campo, são considerados ativos
  }

  function renderizar() {
    const termo = busca.value.trim().toLowerCase();
    const status = filtroStatus.value;

    const filtrados = usuarios.filter(({ dados }) => {
      const texto = `${dados.nome || ""} ${dados.email || ""}`.toLowerCase();
      if (termo && !texto.includes(termo)) return false;
      if (status === "ativos" && !ativo(dados)) return false;
      if (status === "inativos" && ativo(dados)) return false;
      return true;
    });

    if (!filtrados.length) {
      tabela.innerHTML = `<tr><td colspan="6">Nenhum usuário encontrado.</td></tr>`;
      return;
    }

    tabela.innerHTML = filtrados
      .map(({ id, dados }) => {
        const estaAtivo = ativo(dados);
        return `
          <tr>
            <td>${escaparHtml(dados.nome || "—")}</td>
            <td>${escaparHtml(dados.email || "—")}</td>
            <td>${escaparHtml(dados.telefone || "—")}</td>
            <td>${escaparHtml(formatarData(dados.dataCadastro))}</td>
            <td><span class="badge ${estaAtivo ? "badge-ativo" : "badge-desativado"}">${estaAtivo ? "Ativo" : "Inativo"}</span></td>
            <td>
              <button class="${estaAtivo ? "danger-btn" : "success-btn small-btn"}" data-id="${id}" data-ativar="${!estaAtivo}" type="button">
                ${estaAtivo ? "Desativar" : "Ativar"}
              </button>
            </td>
          </tr>`;
      })
      .join("");
  }

  function iniciarEscuta() {
    if (pararEscuta) return;
    pararEscuta = window.firebaseDb.collection("Usuarios").onSnapshot(
      (snapshot) => {
        usuarios = snapshot.docs
          .map((doc) => ({ id: doc.id, dados: doc.data() }))
          .sort((a, b) => (a.dados.nome || "").localeCompare(b.dados.nome || "", "pt-BR"));
        renderizar();
      },
      (erro) => {
        console.error("Erro ao buscar usuários:", erro);
        pararEscuta = null;
        mostrarMensagem("Não foi possível carregar os usuários.", "error");
      }
    );
  }

  tabela.addEventListener("click", async (event) => {
    const botao = event.target.closest("button[data-id]");
    if (!botao) return;

    const ativar = botao.dataset.ativar === "true";
    const usuario = usuarios.find((u) => u.id === botao.dataset.id);
    const nome = usuario ? usuario.dados.nome || usuario.dados.email : "este usuário";

    if (!ativar && !confirm(`Desativar a conta de "${nome}"? A pessoa não conseguirá mais entrar no aplicativo.`)) {
      return;
    }

    try {
      await window.firebaseDb.collection("Usuarios").doc(botao.dataset.id).update({ ativo: ativar });
      mostrarMensagem(ativar ? "Conta ativada." : "Conta desativada.");
    } catch (erro) {
      console.error("Erro ao alterar status do usuário:", erro);
      mostrarMensagem("Não foi possível alterar o status.", "error");
    }
  });

  busca.addEventListener("input", renderizar);
  filtroStatus.addEventListener("change", renderizar);

  document.addEventListener("ampara:pagina", (e) => {
    if (e.detail === "usuarios") iniciarEscuta();
  });

  document.addEventListener("ampara:logout", () => {
    if (pararEscuta) pararEscuta();
    pararEscuta = null;
    usuarios = [];
  });
})();
