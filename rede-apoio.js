// =============================================================
// AMPARA - Painel Administrativo
// Rede de Apoio: cadastro (3.1.15) e gerenciamento (3.1.16)
// Coleção no Firestore: "instituicoes"
// Campos (baseados na entidade instituicao_apoio do diagrama de classes):
//   nome, categoria, cidade, uf, endereco, telefone, email,
//   descricao, ativo (boolean), dataCadastro, dataAtualizacao
// =============================================================

(function () {
  const COLECAO = "instituicoes";
  const ITENS_POR_PAGINA = 8;

  const listaView = document.getElementById("apoioListaView");
  const formView = document.getElementById("apoioFormView");
  const tabela = document.getElementById("apoioTableBody");
  const busca = document.getElementById("apoioSearchInput");
  const btnNova = document.getElementById("btnNovaUnidade");
  const btnPrev = document.getElementById("apoioPrev");
  const btnNext = document.getElementById("apoioNext");
  const pageInfo = document.getElementById("apoioPageInfo");

  const form = document.getElementById("apoioForm");
  const formTitulo = document.getElementById("apoioFormTitulo");
  const formErro = document.getElementById("apoioFormErro");
  const btnCancelar = document.getElementById("apoioCancelar");
  const btnSalvar = document.getElementById("apoioSalvar");

  const campos = {
    nome: document.getElementById("apoioNome"),
    categoria: document.getElementById("apoioCategoria"),
    cidade: document.getElementById("apoioCidade"),
    uf: document.getElementById("apoioUf"),
    telefone: document.getElementById("apoioTelefone"),
    endereco: document.getElementById("apoioEndereco"),
    email: document.getElementById("apoioEmail"),
    descricao: document.getElementById("apoioDescricao"),
    ativo: document.getElementById("apoioAtivo")
  };

  let instituicoes = [];
  let paginaAtual = 1;
  let idEmEdicao = null;
  let escutando = false;
  let pararEscuta = null;

  // Evita que textos digitados sejam interpretados como HTML na tabela.
  function escaparHtml(texto) {
    return String(texto ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function aviso(texto, tipo) {
    if (typeof mostrarMensagem === "function") {
      mostrarMensagem(texto, tipo);
    }
  }

  // ---------- Listagem ----------

  function filtrar() {
    const termo = busca.value.trim().toLowerCase();
    if (!termo) return instituicoes;
    return instituicoes.filter((item) => {
      const d = item.dados;
      return `${d.nome || ""} ${d.categoria || ""} ${d.cidade || ""}`
        .toLowerCase()
        .includes(termo);
    });
  }

  function renderizar() {
    const filtradas = filtrar();
    const totalPaginas = Math.max(1, Math.ceil(filtradas.length / ITENS_POR_PAGINA));
    if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const pagina = filtradas.slice(inicio, inicio + ITENS_POR_PAGINA);

    pageInfo.textContent = `${paginaAtual} de ${totalPaginas}`;
    btnPrev.disabled = paginaAtual <= 1;
    btnNext.disabled = paginaAtual >= totalPaginas;

    if (!pagina.length) {
      tabela.innerHTML = `
        <tr>
          <td colspan="6">${
            instituicoes.length
              ? "Nenhuma unidade encontrada para essa busca."
              : "Nenhuma unidade cadastrada ainda. Clique em \"+ Nova Unidade\"."
          }</td>
        </tr>`;
      return;
    }

    tabela.innerHTML = pagina
      .map(({ id, dados }) => {
        const ativo = dados.ativo !== false;
        return `
          <tr>
            <td>${escaparHtml(dados.nome)}</td>
            <td>${escaparHtml(dados.categoria)}</td>
            <td>${escaparHtml(dados.cidade)}${dados.uf ? " - " + escaparHtml(dados.uf) : ""}</td>
            <td>${escaparHtml(dados.telefone)}</td>
            <td><span class="badge ${ativo ? "badge-ativo" : "badge-inativo"}">${ativo ? "Ativa" : "Inativa"}</span></td>
            <td>
              <button class="edit-btn" data-acao="editar" data-id="${id}" type="button">Editar</button>
              <button class="danger-btn" data-acao="excluir" data-id="${id}" type="button">Excluir</button>
            </td>
          </tr>`;
      })
      .join("");
  }

  function iniciarEscuta() {
    if (escutando) return;
    if (!window.firebaseReady || !window.firebaseDb) {
      aviso("Configure o Firebase para carregar a rede de apoio.", "error");
      return;
    }
    escutando = true;

    pararEscuta = window.firebaseDb.collection(COLECAO).onSnapshot(
      (snapshot) => {
        instituicoes = snapshot.docs
          .map((doc) => ({ id: doc.id, dados: doc.data() }))
          .sort((a, b) => (a.dados.nome || "").localeCompare(b.dados.nome || "", "pt-BR"));
        renderizar();
      },
      (erro) => {
        console.error("Erro ao buscar instituições:", erro);
        escutando = false;
        aviso("Não foi possível carregar a rede de apoio.", "error");
      }
    );
  }

  // ---------- Formulário ----------

  function abrirFormulario(item) {
    form.reset();
    formErro.textContent = "";
    idEmEdicao = item ? item.id : null;
    formTitulo.textContent = item ? "Editar Unidade de Apoio" : "Adicionar Unidade de Apoio";

    if (item) {
      const d = item.dados;
      campos.nome.value = d.nome || "";
      campos.categoria.value = d.categoria || "";
      campos.cidade.value = d.cidade || "";
      campos.uf.value = d.uf || "PR";
      campos.telefone.value = d.telefone || "";
      campos.endereco.value = d.endereco || "";
      campos.email.value = d.email || "";
      campos.descricao.value = d.descricao || "";
      campos.ativo.checked = d.ativo !== false;
    } else {
      campos.uf.value = "PR";
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

  // Máscara simples de telefone: (43) 3333-3333 ou (43) 99999-9999
  function formatarTelefone(valor) {
    const n = valor.replace(/\D/g, "").slice(0, 11);
    if (n.length <= 2) return n.length ? `(${n}` : "";
    if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }

  function lerFormulario() {
    return {
      nome: campos.nome.value.trim(),
      categoria: campos.categoria.value,
      cidade: campos.cidade.value.trim(),
      uf: campos.uf.value,
      telefone: campos.telefone.value.trim(),
      endereco: campos.endereco.value.trim(),
      email: campos.email.value.trim(),
      descricao: campos.descricao.value.trim(),
      ativo: campos.ativo.checked
    };
  }

  function validar(dados) {
    if (!dados.nome) return "Informe o nome da unidade.";
    if (!dados.categoria) return "Selecione o tipo de unidade.";
    if (!dados.cidade) return "Informe a cidade.";
    if (dados.telefone.replace(/\D/g, "").length < 10) return "Informe um telefone válido com DDD.";
    if (!dados.endereco) return "Informe o endereço.";
    return "";
  }

  async function salvar(event) {
    event.preventDefault();
    const dados = lerFormulario();
    const erro = validar(dados);
    if (erro) {
      formErro.textContent = erro;
      return;
    }

    const agora = firebase.firestore.FieldValue.serverTimestamp();
    btnSalvar.disabled = true;

    try {
      const colecao = window.firebaseDb.collection(COLECAO);
      if (idEmEdicao) {
        await colecao.doc(idEmEdicao).update({ ...dados, dataAtualizacao: agora });
        aviso("Unidade atualizada com sucesso.");
      } else {
        await colecao.add({ ...dados, dataCadastro: agora, dataAtualizacao: agora });
        aviso("Unidade cadastrada com sucesso.");
      }
      fecharFormulario();
    } catch (e) {
      console.error("Erro ao salvar instituição:", e);
      formErro.textContent = "Não foi possível salvar. Verifique a conexão e as regras do Firestore.";
    } finally {
      btnSalvar.disabled = false;
    }
  }

  async function excluir(id) {
    const item = instituicoes.find((i) => i.id === id);
    const nome = item ? item.dados.nome : "esta unidade";
    if (!confirm(`Excluir "${nome}"? Essa ação não pode ser desfeita.`)) return;

    try {
      await window.firebaseDb.collection(COLECAO).doc(id).delete();
      aviso("Unidade excluída.");
    } catch (e) {
      console.error("Erro ao excluir instituição:", e);
      aviso("Não foi possível excluir a unidade.", "error");
    }
  }

  // ---------- Eventos ----------

  btnNova.addEventListener("click", () => abrirFormulario(null));
  btnCancelar.addEventListener("click", fecharFormulario);
  form.addEventListener("submit", salvar);

  campos.telefone.addEventListener("input", () => {
    campos.telefone.value = formatarTelefone(campos.telefone.value);
  });

  busca.addEventListener("input", () => {
    paginaAtual = 1;
    renderizar();
  });

  btnPrev.addEventListener("click", () => {
    paginaAtual -= 1;
    renderizar();
  });

  btnNext.addEventListener("click", () => {
    paginaAtual += 1;
    renderizar();
  });

  tabela.addEventListener("click", (event) => {
    const botao = event.target.closest("button[data-acao]");
    if (!botao) return;
    const id = botao.dataset.id;
    if (botao.dataset.acao === "editar") {
      const item = instituicoes.find((i) => i.id === id);
      if (item) abrirFormulario(item);
    } else if (botao.dataset.acao === "excluir") {
      excluir(id);
    }
  });

  // Começa a carregar quando o admin abre a página "Rede de Apoio".
  document.addEventListener("ampara:pagina", (e) => {
    if (e.detail === "apoio") {
      fecharFormulario();
      iniciarEscuta();
    }
  });

  // Ao sair, encerra a escuta do Firestore.
  document.addEventListener("ampara:logout", () => {
    if (pararEscuta) pararEscuta();
    pararEscuta = null;
    escutando = false;
    instituicoes = [];
  });
})();
