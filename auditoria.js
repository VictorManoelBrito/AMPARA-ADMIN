// =============================================================
// AMPARA - Painel Administrativo
// Registro de movimentações (auditoria).
// Coleção "movimentacoes": cada ação feita no painel ou no aplicativo gera
// um documento que NUNCA pode ser alterado ou apagado (regras do Firestore).
// Somente o administrador consegue ler esse registro.
// =============================================================

// ---------- Níveis de acesso ----------
// "administrador" (acesso total) e "moderador" (sem auditoria e sem Administradores). Cadastros antigos ("total" ou sem
// o campo) são tratados como administrador.
window.nivelDoAdmin = function (dados) {
  const nivel = (dados && dados.nivelAcesso) || "administrador";
  return nivel === "moderador" ? "moderador" : "administrador";
};
window.ehAdministrador = function () {
  return !!window.amparaAdmin && window.nivelDoAdmin(window.amparaAdmin) === "administrador";
};

// ---------- Nomes das ações (usados na tela e no CSV) ----------
window.ACOES_MOVIMENTACAO = {
  login_painel: "Entrou no painel",
  logout_painel: "Saiu do painel",
  status_denuncia: "Alterou status da denúncia",
  ver_detalhes: "Visualizou detalhes da denúncia",
  ver_evidencia: "Visualizou evidência",
  instituicao_criada: "Cadastrou unidade da rede de apoio",
  instituicao_editada: "Editou unidade da rede de apoio",
  instituicao_excluida: "Excluiu unidade da rede de apoio",
  usuario_ativado: "Ativou conta de usuário",
  usuario_desativado: "Desativou conta de usuário",
  tipo_criado: "Cadastrou tipo de ocorrência",
  tipo_editado: "Editou tipo de ocorrência",
  tipo_ativado: "Ativou tipo de ocorrência",
  tipo_desativado: "Desativou tipo de ocorrência",
  tipos_importados: "Importou tipos padrão",
  admin_criado: "Cadastrou administrador/moderador",
  admin_ativado: "Ativou administrador/moderador",
  admin_desativado: "Desativou administrador/moderador",
  denuncia_encaminhada: "Encaminhou denúncia por e-mail",
  relatorio_gerado: "Gerou relatório",
  movimentacoes_exportadas: "Exportou o registro de movimentações",
  conta_criada: "Criou conta no aplicativo",
  perfil_atualizado: "Atualizou o perfil",
  denuncia_registrada: "Registrou denúncia identificada",
  denuncia_anonima: "Registrou denúncia anônima"
};

// Monta o documento da movimentação feita pelo administrador logado.
// Útil para gravar junto com outra alteração, no mesmo lote (batch).
window.novaMovimentacao = function (acao, descricao, extra = {}) {
  const user = window.firebaseAuth.currentUser;
  const admin = window.amparaAdmin || {};
  return {
    acao,
    descricao: descricao || window.ACOES_MOVIMENTACAO[acao] || acao,
    origem: "painel",
    perfil: window.nivelDoAdmin(admin),
    autorUid: user ? user.uid : null,
    autorNome: admin.nome || (user && user.email) || "—",
    autorEmail: user ? user.email : null,
    entidade: extra.entidade || null,
    entidadeId: extra.entidadeId || null,
    referencia: extra.referencia || null,
    detalhes: extra.detalhes || null,
    dataHora: firebase.firestore.FieldValue.serverTimestamp()
  };
};

// Grava a movimentação. Nunca interrompe a ação principal se falhar.
window.registrarMovimentacao = async function (acao, descricao, extra = {}) {
  try {
    if (!window.firebaseAuth.currentUser) return;
    await window.firebaseDb.collection("movimentacoes").add(window.novaMovimentacao(acao, descricao, extra));
  } catch (erro) {
    console.error("Erro ao registrar movimentação:", erro);
  }
};

// ---------- Tela "Movimentações" (somente administrador) ----------
(function () {
  const LIMITE = 1000;
  const tabela = document.getElementById("movTableBody");
  const filtroPessoa = document.getElementById("movFiltroPessoa");
  const filtroOrigem = document.getElementById("movFiltroOrigem");
  const filtroAcao = document.getElementById("movFiltroAcao");
  const filtroDe = document.getElementById("movFiltroDe");
  const filtroAte = document.getElementById("movFiltroAte");
  const busca = document.getElementById("movBusca");
  const contador = document.getElementById("movContador");
  if (!tabela) return;

  let movimentacoes = [];
  let pararEscuta = null;

  // Opções do filtro de ação
  filtroAcao.innerHTML = `<option value="">Todas as ações</option>` + Object.entries(window.ACOES_MOVIMENTACAO)
    .map(([codigo, nome]) => `<option value="${codigo}">${escaparHtml(nome)}</option>`).join("");

  function nomeAutor(d) {
    if (d.perfil === "anonimo") return "Anônimo";
    return d.autorNome || d.autorEmail || "—";
  }
  function chaveAutor(d) {
    return d.perfil === "anonimo" ? "anonimo" : (d.autorUid || d.autorEmail || "");
  }
  function rotuloPerfil(d) {
    return { administrador: "Administrador", moderador: "Moderador", usuario: "Usuário", anonimo: "Anônimo" }[d.perfil] || "—";
  }

  function atualizarPessoas() {
    const atual = filtroPessoa.value;
    const pessoas = new Map();
    movimentacoes.forEach(({ dados }) => {
      const chave = chaveAutor(dados);
      if (chave && !pessoas.has(chave)) pessoas.set(chave, `${nomeAutor(dados)} (${rotuloPerfil(dados)})`);
    });
    filtroPessoa.innerHTML = `<option value="">Todas as pessoas</option>` + [...pessoas.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
      .map(([chave, nome]) => `<option value="${escaparHtml(chave)}">${escaparHtml(nome)}</option>`).join("");
    if ([...pessoas.keys()].includes(atual)) filtroPessoa.value = atual;
  }

  function filtradas() {
    const pessoa = filtroPessoa.value;
    const origem = filtroOrigem.value;
    const acao = filtroAcao.value;
    const de = filtroDe.value ? new Date(filtroDe.value + "T00:00:00") : null;
    const ate = filtroAte.value ? new Date(filtroAte.value + "T23:59:59") : null;
    const termo = busca.value.trim().toLowerCase();
    return movimentacoes.filter(({ dados }) => {
      if (pessoa && chaveAutor(dados) !== pessoa) return false;
      if (origem && dados.origem !== origem) return false;
      if (acao && dados.acao !== acao) return false;
      const quando = paraData(dados.dataHora);
      if (de && (!quando || quando < de)) return false;
      if (ate && (!quando || quando > ate)) return false;
      if (termo) {
        const texto = `${dados.descricao || ""} ${dados.referencia || ""} ${nomeAutor(dados)} ${dados.autorEmail || ""}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      return true;
    });
  }

  function renderizar() {
    const lista = filtradas();
    contador.textContent = `${lista.length} movimentação(ões)` + (movimentacoes.length >= LIMITE ? ` · exibindo as ${LIMITE} mais recentes` : "");
    if (!lista.length) {
      tabela.innerHTML = `<tr><td colspan="5">Nenhuma movimentação encontrada.</td></tr>`;
      return;
    }
    tabela.innerHTML = lista.map(({ dados }) => `
      <tr>
        <td class="nowrap">${escaparHtml(formatarData(dados.dataHora))}</td>
        <td>${escaparHtml(nomeAutor(dados))}<br><span class="texto-muted">${escaparHtml(rotuloPerfil(dados))}</span></td>
        <td><span class="badge ${dados.origem === "app" ? "badge-app" : "badge-painel"}">${dados.origem === "app" ? "Aplicativo" : "Painel"}</span></td>
        <td>${escaparHtml(window.ACOES_MOVIMENTACAO[dados.acao] || dados.acao || "—")}</td>
        <td>${escaparHtml(dados.descricao || "—")}${dados.referencia ? `<br><span class="texto-muted">${escaparHtml(dados.referencia)}</span>` : ""}</td>
      </tr>`).join("");
  }

  function iniciarEscuta() {
    if (pararEscuta || !window.ehAdministrador()) return;
    pararEscuta = window.firebaseDb.collection("movimentacoes")
      .orderBy("dataHora", "desc").limit(LIMITE)
      .onSnapshot((snap) => {
        movimentacoes = snap.docs.map((doc) => ({ id: doc.id, dados: doc.data() }));
        atualizarPessoas();
        renderizar();
      }, (erro) => {
        console.error("Erro ao carregar movimentações:", erro);
        pararEscuta = null;
        tabela.innerHTML = `<tr><td colspan="5">Não foi possível carregar. Verifique se as regras do Firestore foram publicadas.</td></tr>`;
      });
  }

  function exportarCsv() {
    const lista = filtradas();
    const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const linhas = [["Data e hora", "Pessoa", "E-mail", "Perfil", "Origem", "Ação", "Descrição", "Referência"]]
      .concat(lista.map(({ dados }) => [formatarData(dados.dataHora), nomeAutor(dados), dados.autorEmail || "",
        rotuloPerfil(dados), dados.origem === "app" ? "Aplicativo" : "Painel",
        window.ACOES_MOVIMENTACAO[dados.acao] || dados.acao, dados.descricao || "", dados.referencia || ""]));
    const csv = "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `ampara-movimentacoes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    window.registrarMovimentacao("movimentacoes_exportadas", `Exportou ${lista.length} movimentação(ões) em CSV`);
  }

  [filtroPessoa, filtroOrigem, filtroAcao, filtroDe, filtroAte].forEach((el) => el.addEventListener("change", renderizar));
  busca.addEventListener("input", renderizar);
  document.getElementById("movLimpar").addEventListener("click", () => {
    [filtroPessoa, filtroOrigem, filtroAcao, filtroDe, filtroAte, busca].forEach((el) => (el.value = ""));
    renderizar();
  });
  document.getElementById("movExportar").addEventListener("click", exportarCsv);

  document.addEventListener("ampara:pagina", (e) => {
    if (e.detail === "movimentacoes") iniciarEscuta();
  });
  document.addEventListener("ampara:logout", () => {
    if (pararEscuta) pararEscuta();
    pararEscuta = null;
    movimentacoes = [];
  });
})();

// ---------- Histórico de uma denúncia (usado na janela de Detalhes) ----------
window.historicoDaDenuncia = async function (denunciaId) {
  if (!window.ehAdministrador()) return null; // moderador não acessa a auditoria
  try {
    const snap = await window.firebaseDb.collection("movimentacoes").where("entidadeId", "==", denunciaId).get();
    return snap.docs.map((d) => d.data())
      .sort((a, b) => (paraData(a.dataHora) || 0) - (paraData(b.dataHora) || 0));
  } catch (erro) {
    console.error("Erro ao carregar histórico:", erro);
    return [];
  }
};
