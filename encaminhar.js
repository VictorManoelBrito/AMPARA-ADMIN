// =============================================================
// AMPARA - Painel Administrativo
// Encaminhamento da denúncia por e-mail para um órgão da Rede de Apoio.
// O painel monta assunto e mensagem; a equipe revisa e envia pelo próprio
// e-mail (Gmail ou programa de e-mail). O encaminhamento fica registrado
// nas Movimentações e no histórico da denúncia.
// =============================================================

(function () {
  const modal = document.getElementById("encaminharModal");
  const selInstituicao = document.getElementById("encInstituicao");
  const campoPara = document.getElementById("encPara");
  const campoAssunto = document.getElementById("encAssunto");
  const campoMensagem = document.getElementById("encMensagem");
  const chkContato = document.getElementById("encIncluirContato");
  const rotuloContato = document.getElementById("encIncluirContatoRotulo");
  const chkStatus = document.getElementById("encMudarStatus");
  const erro = document.getElementById("encErro");
  if (!modal) return;

  let denunciaId = null;
  let denuncia = null;
  let instituicoes = [];

  function urgente(d) {
    const u = (d.urgencia || "").toLowerCase();
    return u.includes("alta") || u.includes("urgente");
  }

  function montarAssunto(d) {
    return `${urgente(d) ? "URGENTE – " : ""}[AMPARA] Solicitação de atendimento – ${d.tipo || "Ocorrência"} – Protocolo ${d.protocolo || "—"}`;
  }

  function montarMensagem(d, nomeInstituicao, incluirContato) {
    const relato = (d.relato || "").trim();
    const linhas = [
      `Prezada equipe${nomeInstituicao ? " do(a) " + nomeInstituicao : ""},`,
      "",
      "A equipe do AMPARA – Plataforma para registro seguro de ocorrências e apoio a pessoas vulneráveis solicita atendimento e acompanhamento para o caso abaixo.",
      "",
      `Protocolo: ${d.protocolo || "—"}`,
      `Tipo de ocorrência: ${d.tipo || "—"}`,
      `Data da ocorrência: ${formatarData(d.dataHoraOcorrencia)}`,
      `Registrada no sistema em: ${formatarData(d.dataCriacao)}`,
      `Local: ${localDaDenuncia(d)}`,
      `Urgência: ${d.urgencia || "—"}`,
      `Denúncia: ${d.anonimo ? "anônima" : "identificada"}`,
      "",
      "Relato:",
      relato ? `"${relato}"` : "(A pessoa não escreveu um relato. Descreva aqui as informações disponíveis.)"
    ];

    if (incluirContato) {
      if (d.anonimo && (d.contatoConfiancaTelefone || d.contatoConfiancaNome)) {
        linhas.push("", `Contato de confiança indicado: ${d.contatoConfiancaNome || "(nome não informado)"} – ${d.contatoConfiancaTelefone || ""}`,
          "Atenção: não pergunte nem revele a identidade de quem denunciou.");
      } else if (!d.anonimo) {
        linhas.push("", `Contato do denunciante: ${d.nomeDenunciante || "—"} – ${d.telefoneDenunciante || "—"} – ${d.emailDenunciante || "—"}`);
      }
    }

    const admin = window.amparaAdmin || {};
    linhas.push("",
      "Pedimos, por favor, que confirmem o recebimento e informem as providências adotadas, citando o protocolo acima.",
      "",
      "Atenciosamente,",
      admin.nome || admin.email || "",
      "Equipe AMPARA");
    return linhas.join("\n");
  }

  function temContato(d) {
    return d.anonimo ? !!(d.contatoConfiancaTelefone || d.contatoConfiancaNome) : true;
  }

  function nomeSelecionado() {
    const op = selInstituicao.options[selInstituicao.selectedIndex];
    return op && op.value ? op.dataset.nome : "";
  }

  function remontar() {
    campoMensagem.value = montarMensagem(denuncia, nomeSelecionado(), chkContato.checked);
  }

  async function carregarInstituicoes() {
    try {
      const snap = await window.firebaseDb.collection("instituicoes").get();
      instituicoes = snap.docs.map((doc) => doc.data())
        .filter((i) => i.ativo !== false && i.email)
        .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    } catch (e) {
      console.error("Erro ao carregar instituições:", e);
      instituicoes = [];
    }
    selInstituicao.innerHTML = `<option value="">Digitar o e-mail manualmente</option>` + instituicoes
      .map((i) => `<option value="${escaparHtml(i.email)}" data-nome="${escaparHtml(i.nome || "")}">${escaparHtml(i.nome || i.email)} (${escaparHtml(i.cidade || "")})</option>`)
      .join("");
  }

  // Chamado pela janela de Detalhes
  window.abrirEncaminhamento = async function (id) {
    const item = denuncias.find((d) => d.id === id);
    if (!item) return;
    denunciaId = id;
    denuncia = item.dados;
    erro.textContent = "";

    await carregarInstituicoes();
    campoPara.value = "";
    campoAssunto.value = montarAssunto(denuncia);
    chkContato.checked = false; // LGPD: por padrão, só o necessário
    chkContato.disabled = !temContato(denuncia);
    rotuloContato.textContent = denuncia.anonimo
      ? (temContato(denuncia) ? "Incluir o contato de confiança" : "Denúncia anônima sem contato de confiança")
      : "Incluir nome, telefone e e-mail do denunciante";
    chkStatus.checked = (denuncia.status || "Em análise") === "Em análise";
    remontar();
    modal.classList.remove("hidden");
  };

  function fechar() {
    modal.classList.add("hidden");
  }

  function validar() {
    const para = campoPara.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) {
      erro.textContent = "Escolha uma instituição ou informe um e-mail válido.";
      return null;
    }
    if (!campoAssunto.value.trim() || !campoMensagem.value.trim()) {
      erro.textContent = "Preencha o assunto e a mensagem.";
      return null;
    }
    erro.textContent = "";
    return para;
  }

  // Registra o encaminhamento (e, se marcado, muda o status) no mesmo lote
  async function registrar(para, meio) {
    const destino = nomeSelecionado() || para;
    const lote = window.firebaseDb.batch();
    const anterior = denuncia.status || "Em análise";
    if (chkStatus.checked && anterior !== "Em andamento") {
      lote.update(window.firebaseDb.collection("denuncias").doc(denunciaId), { status: "Em andamento" });
      lote.set(window.firebaseDb.collection("movimentacoes").doc(), window.novaMovimentacao(
        "status_denuncia", `Status alterado de "${anterior}" para "Em andamento"`,
        { entidade: "denuncia", entidadeId: denunciaId, referencia: denuncia.protocolo || null,
          detalhes: { de: anterior, para: "Em andamento" } }));
    }
    lote.set(window.firebaseDb.collection("movimentacoes").doc(), window.novaMovimentacao(
      "denuncia_encaminhada", `Encaminhou a denúncia para ${destino} (${para}) por e-mail`,
      { entidade: "denuncia", entidadeId: denunciaId, referencia: denuncia.protocolo || null,
        detalhes: { para, instituicao: nomeSelecionado() || null, meio, contatoIncluido: chkContato.checked } }));
    try {
      await lote.commit();
      mostrarMensagem("Encaminhamento registrado.");
    } catch (e) {
      console.error("Erro ao registrar encaminhamento:", e);
      mostrarMensagem("A mensagem foi aberta, mas não foi possível registrar o encaminhamento.", "error");
    }
  }

  function abrirGmail() {
    const para = validar();
    if (!para) return;
    const url = "https://mail.google.com/mail/?view=cm&fs=1"
      + `&to=${encodeURIComponent(para)}&su=${encodeURIComponent(campoAssunto.value)}&body=${encodeURIComponent(campoMensagem.value)}`;
    window.open(url, "_blank", "noopener");
    registrar(para, "Gmail");
    fechar();
  }

  function abrirAppEmail() {
    const para = validar();
    if (!para) return;
    window.location.href = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(campoAssunto.value)}&body=${encodeURIComponent(campoMensagem.value)}`;
    registrar(para, "aplicativo de e-mail");
    fechar();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Assunto: ${campoAssunto.value}\n\n${campoMensagem.value}`);
      mostrarMensagem("Assunto e mensagem copiados. Cole no seu e-mail.");
    } catch (e) {
      erro.textContent = "Não foi possível copiar. Selecione o texto e use Ctrl+C.";
    }
  }

  selInstituicao.addEventListener("change", () => {
    campoPara.value = selInstituicao.value;
    remontar();
  });
  chkContato.addEventListener("change", remontar);
  document.getElementById("encGmail").addEventListener("click", abrirGmail);
  document.getElementById("encApp").addEventListener("click", abrirAppEmail);
  document.getElementById("encCopiar").addEventListener("click", copiar);
  document.getElementById("encFechar").addEventListener("click", fechar);
  document.getElementById("encCancelar").addEventListener("click", fechar);
  modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
})();
