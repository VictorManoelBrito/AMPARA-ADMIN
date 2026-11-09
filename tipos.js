// =============================================================
// AMPARA - Painel Administrativo
// Tipos de Ocorrência (cadastro 2.1.1 / entidade tipo_ocorrencia).
// Coleção: "tipos_ocorrencia" (nome, categoria, descricao, ativo)
// O aplicativo lê os tipos ATIVOS desta coleção ao registrar uma denúncia.
// Tipos não são excluídos, apenas desativados, para preservar o histórico das denúncias.
// =============================================================

(function () {
  const COLECAO = "tipos_ocorrencia";

  // Mesmos tipos usados pelo app quando a coleção está vazia.
  const TIPOS_PADRAO = [
    { nome: "Violência Doméstica", categoria: "Violência contra a Mulher", descricao: "Violência física, psicológica, sexual, patrimonial ou moral no ambiente doméstico ou familiar." },
    { nome: "Assédio", categoria: "Violência contra a Mulher", descricao: "Assédio moral ou sexual, inclusive no trabalho ou em locais públicos." },
    { nome: "Ameaça", categoria: "Violência e Ameaça", descricao: "Ameaça de causar mal grave, presencialmente ou por mensagens." },
    { nome: "Discriminação Racial", categoria: "Discriminação", descricao: "Racismo ou injúria racial (Lei 7.716/1989 e Lei 14.532/2023)." },
    { nome: "LGBTfobia", categoria: "Discriminação", descricao: "Discriminação por orientação sexual ou identidade de gênero (STF, ADO 26 e MI 4733)." },
    { nome: "Crime Cibernético - Ameaça Virtual", categoria: "Crime Cibernético", descricao: "Ameaças, perseguição ou ofensas pela internet." },
    { nome: "Crime Cibernético - Invasão de Conta", categoria: "Crime Cibernético", descricao: "Invasão de celular, computador ou contas (Lei Carolina Dieckmann)." },
    { nome: "Crime Cibernético - Divulgação Indevida de Conteúdo", categoria: "Crime Cibernético", descricao: "Divulgação de fotos, vídeos ou dados sem consentimento." },
    { nome: "Outros", categoria: "Outros", descricao: "Situações que não se encaixam nos tipos acima." }
  ];

  const listaView = document.getElementById("tiposListaView");
  const formView = document.getElementById("tiposFormView");
  const tabela = document.getElementById("tiposTableBody");
  const vazio = document.getElementById("tiposVazio");
  const form = document.getElementById("tipoForm");
  const titulo = document.getElementById("tipoFormTitulo");
  const erro = document.getElementById("tipoFormErro");
  const btnSalvar = document.getElementById("tipoSalvar");
  const btnImportar = document.getElementById("btnImportarTipos");
  const campos = {
    nome: document.getElementById("tipoNome"),
    categoria: document.getElementById("tipoCategoria"),
    descricao: document.getElementById("tipoDescricao"),
    ativo: document.getElementById("tipoAtivo")
  };

  let tipos = [];
  let pararEscuta = null;
  let idEmEdicao = null;

  function renderizar() {
    vazio.classList.toggle("hidden", tipos.length > 0);

    if (!tipos.length) {
      tabela.innerHTML = `<tr><td colspan="5">Nenhum tipo cadastrado.</td></tr>`;
      return;
    }

    tabela.innerHTML = tipos
      .map(({ id, dados }) => {
        const ativo = dados.ativo !== false;
        return `
          <tr>
            <td>${escaparHtml(dados.nome)}</td>
            <td>${escaparHtml(dados.categoria || "—")}</td>
            <td class="relato-cell">${escaparHtml(dados.descricao || "—")}</td>
            <td><span class="badge ${ativo ? "badge-ativo" : "badge-desativado"}">${ativo ? "Ativo" : "Inativo"}</span></td>
            <td>
              <button class="edit-btn" data-acao="editar" data-id="${id}" type="button">Editar</button>
              <button class="${ativo ? "danger-btn" : "success-btn small-btn"}" data-acao="status" data-ativar="${!ativo}" data-id="${id}" type="button">${ativo ? "Desativar" : "Ativar"}</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  function iniciarEscuta() {
    if (pararEscuta) return;
    pararEscuta = window.firebaseDb.collection(COLECAO).onSnapshot(
      (snapshot) => {
        tipos = snapshot.docs
          .map((doc) => ({ id: doc.id, dados: doc.data() }))
          .sort((a, b) => {
            // "Outros" sempre por último
            if (a.dados.nome === "Outros") return 1;
            if (b.dados.nome === "Outros") return -1;
            return (a.dados.nome || "").localeCompare(b.dados.nome || "", "pt-BR");
          });
        renderizar();
      },
      (e) => {
        console.error("Erro ao buscar tipos de ocorrência:", e);
        pararEscuta = null;
        vazio.classList.add("hidden");
        tabela.innerHTML = `<tr><td colspan="5" class="erro-tabela">${
          e.code === "permission-denied"
            ? "Sem permissão para ler os tipos de ocorrência. Publique as regras atualizadas (firebase/firestore.rules) no Console do Firebase e recarregue a página."
            : "Não foi possível carregar os tipos de ocorrência. Verifique a conexão e recarregue a página."
        }</td></tr>`;
      }
    );
  }

  function abrirFormulario(item) {
    form.reset();
    erro.textContent = "";
    idEmEdicao = item ? item.id : null;
    titulo.textContent = item ? "Editar Tipo de Ocorrência" : "Novo Tipo de Ocorrência";
    if (item) {
      campos.nome.value = item.dados.nome || "";
      campos.categoria.value = item.dados.categoria || "";
      campos.descricao.value = item.dados.descricao || "";
      campos.ativo.checked = item.dados.ativo !== false;
    } else {
      campos.ativo.checked = true;
    }
    listaView.classList.add("hidden");
    formView.classList.remove("hidden");
    campos.nome.focus();
  }

  function fecharFormulario() {
    idEmEdicao = null;
    formView.classList.add("hidden");
    listaView.classList.remove("hidden");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const dados = {
      nome: campos.nome.value.trim(),
      categoria: campos.categoria.value,
      descricao: campos.descricao.value.trim(),
      ativo: campos.ativo.checked
    };

    if (!dados.nome) return (erro.textContent = "Informe o nome do tipo.");
    if (!dados.categoria) return (erro.textContent = "Selecione a categoria.");
    const repetido = tipos.some((t) => t.id !== idEmEdicao && (t.dados.nome || "").toLowerCase() === dados.nome.toLowerCase());
    if (repetido) return (erro.textContent = "Já existe um tipo com esse nome.");

    if (idEmEdicao) {
      const original = tipos.find((t) => t.id === idEmEdicao);
      if (original && original.dados.nome !== dados.nome &&
          !confirm("Alterar o nome não muda as denúncias já registradas com o nome antigo. Continuar?")) {
        return;
      }
    }

    btnSalvar.disabled = true;
    try {
      const agora = firebase.firestore.FieldValue.serverTimestamp();
      if (idEmEdicao) {
        await window.firebaseDb.collection(COLECAO).doc(idEmEdicao).update({ ...dados, dataAtualizacao: agora });
        mostrarMensagem("Tipo atualizado.");
      } else {
        await window.firebaseDb.collection(COLECAO).add({ ...dados, dataCadastro: agora });
        mostrarMensagem("Tipo cadastrado.");
      }
      fecharFormulario();
    } catch (e) {
      console.error("Erro ao salvar tipo:", e);
      erro.textContent = "Não foi possível salvar. Verifique a conexão e as regras do Firestore.";
    } finally {
      btnSalvar.disabled = false;
    }
  });

  tabela.addEventListener("click", async (event) => {
    const botao = event.target.closest("button[data-acao]");
    if (!botao) return;
    const item = tipos.find((t) => t.id === botao.dataset.id);
    if (!item) return;

    if (botao.dataset.acao === "editar") {
      abrirFormulario(item);
      return;
    }

    const ativar = botao.dataset.ativar === "true";
    if (!ativar && !confirm(`Desativar o tipo "${item.dados.nome}"? Ele deixará de aparecer no aplicativo.`)) return;
    try {
      await window.firebaseDb.collection(COLECAO).doc(item.id).update({ ativo: ativar });
      mostrarMensagem(ativar ? "Tipo ativado." : "Tipo desativado.");
    } catch (e) {
      console.error("Erro ao alterar tipo:", e);
      mostrarMensagem("Não foi possível alterar o tipo.", "error");
    }
  });

  btnImportar.addEventListener("click", async () => {
    btnImportar.disabled = true;
    try {
      const lote = window.firebaseDb.batch();
      const agora = firebase.firestore.FieldValue.serverTimestamp();
      TIPOS_PADRAO.forEach((t) => {
        lote.set(window.firebaseDb.collection(COLECAO).doc(), { ...t, ativo: true, dataCadastro: agora });
      });
      await lote.commit();
      mostrarMensagem("Tipos padrão importados.");
    } catch (e) {
      console.error("Erro ao importar tipos:", e);
      mostrarMensagem("Não foi possível importar os tipos.", "error");
    } finally {
      btnImportar.disabled = false;
    }
  });

  document.getElementById("btnNovoTipo").addEventListener("click", () => abrirFormulario(null));
  document.getElementById("tipoCancelar").addEventListener("click", fecharFormulario);

  document.addEventListener("ampara:pagina", (e) => {
    if (e.detail === "tipos") {
      fecharFormulario();
      iniciarEscuta();
    }
  });

  document.addEventListener("ampara:logout", () => {
    if (pararEscuta) pararEscuta();
    pararEscuta = null;
    tipos = [];
  });
})();
