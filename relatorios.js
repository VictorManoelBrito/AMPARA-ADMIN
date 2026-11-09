// =============================================================
// AMPARA - Painel Administrativo
// Relatórios (3.1.17 e 3.2): denúncias, por região, por tipo, por período,
// unidades de apoio, usuários e estatísticas gerais.
// Os relatórios NÃO exibem relatos nem dados que identifiquem vítimas (LGPD).
// =============================================================

(function () {
  const form = document.getElementById("relatorioForm");
  const campoTipo = document.getElementById("relTipo");
  const campoPeriodo = document.getElementById("relPeriodo");
  const blocoPeriodo = document.getElementById("relCampoPeriodo");
  const blocoDatas = document.getElementById("relDatas");
  const dataInicio = document.getElementById("relDataInicio");
  const dataFim = document.getElementById("relDataFim");
  const blocoCidade = document.getElementById("relCampoCidade");
  const campoCidade = document.getElementById("relCidade");
  const blocoStatus = document.getElementById("relCampoStatus");
  const campoStatus = document.getElementById("relStatusUsuario");
  const campoFormato = document.getElementById("relFormato");
  const erro = document.getElementById("relErro");
  const btnGerar = document.getElementById("relGerar");
  const resultado = document.getElementById("relResultado");
  const conteudo = document.getElementById("relConteudo");

  const TITULOS = {
    denuncias: "RELATÓRIO DE DENÚNCIAS",
    regiao: "RELATÓRIO DE DENÚNCIAS POR REGIÃO",
    tipo: "RELATÓRIO DE DENÚNCIAS POR TIPO",
    periodo: "RELATÓRIO DE DENÚNCIAS POR PERÍODO",
    unidades: "RELATÓRIO DE UNIDADES DE APOIO",
    usuarios: "RELATÓRIO DE USUÁRIOS",
    estatisticas: "RELATÓRIO DE ESTATÍSTICAS GERAIS"
  };

  // Quais filtros cada relatório usa.
  const FILTROS = {
    denuncias: { periodo: true, cidade: true },
    regiao: { periodo: true, cidade: true },
    tipo: { periodo: true, cidade: true },
    periodo: { periodo: true, cidade: true },
    unidades: { cidade: true },
    usuarios: { status: true },
    estatisticas: { periodo: true, cidade: true }
  };

  const DIA = 24 * 60 * 60 * 1000;

  // ---------- Utilitários ----------

  const fmt = (d) => d.toLocaleDateString("pt-BR");

  function col(texto, largura) {
    const t = String(texto ?? "");
    return t.length > largura - 1 ? t.slice(0, largura - 2) + "… " : t.padEnd(largura);
  }

  function inicioDoDia(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function fimDoDia(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function regiaoDaDenuncia(d) {
    if (d.cidade) return d.bairro ? `${d.bairro} (${d.cidade})` : d.cidade;
    return d.local || "Não informada";
  }

  function maisFrequente(lista) {
    const c = {};
    lista.forEach((v) => (c[v] = (c[v] || 0) + 1));
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "—";
  }

  /** Intervalo de datas escolhido no filtro de período. */
  function intervalo(denunciasLista) {
    const hoje = fimDoDia(new Date());
    const valor = campoPeriodo.value;

    if (valor === "personalizado") {
      if (!dataInicio.value || !dataFim.value) return { erro: "Informe a data inicial e a data final." };
      const ini = inicioDoDia(new Date(dataInicio.value + "T00:00:00"));
      const fim = fimDoDia(new Date(dataFim.value + "T00:00:00"));
      if (ini > fim) return { erro: "A data inicial deve ser anterior à data final." };
      return { ini, fim };
    }
    if (valor === "ano") return { ini: new Date(hoje.getFullYear(), 0, 1), fim: hoje };
    if (valor === "tudo") {
      const datas = denunciasLista.map((d) => paraData(d.dataCriacao)).filter(Boolean);
      const menor = datas.length ? new Date(Math.min(...datas)) : hoje;
      return { ini: inicioDoDia(menor), fim: hoje, tudo: true };
    }
    const dias = parseInt(valor, 10);
    return { ini: inicioDoDia(new Date(hoje.getTime() - (dias - 1) * DIA)), fim: hoje };
  }

  // ---------- Dados ----------

  async function buscar(colecao) {
    const snap = await window.firebaseDb.collection(colecao).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  function filtrarDenuncias(lista, faixa) {
    const cidade = campoCidade.value;
    return lista.filter((d) => {
      const data = paraData(d.dataCriacao);
      if (faixa && (!data || data < faixa.ini || data > faixa.fim)) return false;
      if (cidade && (d.cidade || d.local || "") !== cidade) return false;
      return true;
    });
  }

  async function carregarCidades() {
    try {
      const [dens, insts] = await Promise.all([buscar("denuncias"), buscar("instituicoes")]);
      const cidades = new Set();
      dens.forEach((d) => d.cidade && cidades.add(d.cidade));
      insts.forEach((i) => i.cidade && cidades.add(i.cidade));
      const atual = campoCidade.value;
      campoCidade.innerHTML =
        `<option value="">Todas as cidades (opcional)</option>` +
        [...cidades]
          .sort((a, b) => a.localeCompare(b, "pt-BR"))
          .map((c) => `<option value="${escaparHtml(c)}">${escaparHtml(c)}</option>`)
          .join("");
      campoCidade.value = atual;
    } catch (e) {
      console.warn("Não foi possível carregar as cidades:", e);
    }
  }

  // ---------- Montagem dos relatórios ----------
  // Cada função devolve { colunas: [[título, largura]...], linhas: [[...]...] }

  function relDenuncias(lista) {
    const linhas = lista
      .sort((a, b) => (paraData(a.dataCriacao) || 0) - (paraData(b.dataCriacao) || 0))
      .map((d) => [d.protocolo || d.id.slice(0, 8), d.tipo || "—", d.cidade || d.local || "—",
        paraData(d.dataCriacao) ? fmt(paraData(d.dataCriacao)) : "—", d.status || "Em análise"]);
    return { colunas: [["PROTOCOLO", 18], ["TIPO", 34], ["CIDADE", 22], ["DATA", 13], ["STATUS", 14]], linhas };
  }

  function relRegiao(lista) {
    const grupos = {};
    lista.forEach((d) => {
      const r = regiaoDaDenuncia(d);
      (grupos[r] = grupos[r] || []).push(d.tipo || "Não informado");
    });
    const linhas = Object.entries(grupos)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([regiao, tipos]) => [regiao, String(tipos.length).padStart(2, "0"), maisFrequente(tipos)]);
    return { colunas: [["REGIÃO", 36], ["QUANTIDADE", 14], ["TIPO PREDOMINANTE", 40]], linhas };
  }

  function relTipo(lista) {
    const c = {};
    lista.forEach((d) => (c[d.tipo || "Não informado"] = (c[d.tipo || "Não informado"] || 0) + 1));
    const total = lista.length || 1;
    const linhas = Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, q]) => [tipo, String(q).padStart(2, "0"), `${Math.round((q / total) * 100)}%`]);
    return { colunas: [["TIPO DE DENÚNCIA", 50], ["QUANTIDADE", 14], ["PERCENTUAL", 12]], linhas };
  }

  /** Agrupa por semana (até ~3 meses) ou por mês (períodos maiores). */
  function relPeriodo(lista, faixa) {
    const linhas = [];
    const dias = Math.round((faixa.fim - faixa.ini) / DIA) + 1;

    if (dias <= 92) {
      for (let ini = new Date(faixa.ini); ini <= faixa.fim; ini = new Date(ini.getTime() + 7 * DIA)) {
        const fim = new Date(Math.min(fimDoDia(new Date(ini.getTime() + 6 * DIA)), faixa.fim));
        const q = lista.filter((d) => {
          const dt = paraData(d.dataCriacao);
          return dt && dt >= ini && dt <= fim;
        }).length;
        linhas.push([fmt(ini), fmt(fim), String(q).padStart(2, "0")]);
      }
    } else {
      let ini = new Date(faixa.ini.getFullYear(), faixa.ini.getMonth(), 1);
      while (ini <= faixa.fim) {
        const fim = fimDoDia(new Date(ini.getFullYear(), ini.getMonth() + 1, 0));
        const q = lista.filter((d) => {
          const dt = paraData(d.dataCriacao);
          return dt && dt >= ini && dt <= fim;
        }).length;
        linhas.push([fmt(ini < faixa.ini ? faixa.ini : ini), fmt(fim > faixa.fim ? faixa.fim : fim), String(q).padStart(2, "0")]);
        ini = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
      }
    }
    return { colunas: [["DATA INICIAL", 16], ["DATA FINAL", 16], ["QUANTIDADE DE DENÚNCIAS", 26]], linhas,
      total: `TOTAL DE DENÚNCIAS NO PERÍODO: ${lista.length}` };
  }

  function relUnidades(lista) {
    const cidade = campoCidade.value;
    const linhas = lista
      .filter((i) => !cidade || i.cidade === cidade)
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"))
      .map((i) => [i.nome || "—", i.categoria || "—", i.cidade || "—", i.telefone || "—", i.ativo === false ? "Inativa" : "Ativa"]);
    return { colunas: [["NOME", 32], ["TIPO", 30], ["CIDADE", 18], ["TELEFONE", 17], ["STATUS", 8]], linhas };
  }

  function relUsuarios(lista) {
    const status = campoStatus.value;
    const linhas = lista
      .filter((u) => (status === "ativos" ? u.ativo !== false : status === "inativos" ? u.ativo === false : true))
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"))
      .map((u) => [u.nome || "—", u.email || "—", paraData(u.dataCadastro) ? fmt(paraData(u.dataCadastro)) : "—",
        u.ativo === false ? "Inativo" : "Ativo"]);
    return { colunas: [["NOME", 28], ["E-MAIL", 34], ["DATA CADASTRO", 16], ["STATUS", 8]], linhas };
  }

  function relEstatisticas(lista, instituicoes, usuarios) {
    const status = (d) => d.status || "Em análise";
    const linhas = [
      ["Total de denúncias", lista.length],
      ["Denúncias em análise", lista.filter((d) => status(d) === "Em análise").length],
      ["Denúncias em andamento", lista.filter((d) => status(d) === "Em andamento").length],
      ["Denúncias finalizadas", lista.filter((d) => status(d) === "Concluída" || status(d) === "Finalizado").length],
      ["Denúncias anônimas", lista.filter((d) => d.anonimo).length],
      ["Denúncias identificadas", lista.filter((d) => !d.anonimo).length],
      ["Região com maior incidência", lista.length ? maisFrequente(lista.map(regiaoDaDenuncia)) : "—"],
      ["Tipo mais recorrente", lista.length ? maisFrequente(lista.map((d) => d.tipo || "Não informado")) : "—"],
      ["Unidades de apoio ativas", instituicoes.filter((i) => i.ativo !== false).length],
      ["Usuários ativos cadastrados", usuarios.filter((u) => u.ativo !== false).length]
    ].map(([a, b]) => [a, String(b)]);
    return { colunas: [["INDICADOR", 38], ["VALOR", 40]], linhas, total: "" };
  }

  // ---------- Saída ----------

  function descreverFiltro(tipo, faixa) {
    const partes = [];
    if (FILTROS[tipo].periodo && faixa) {
      partes.push(faixa.tudo ? "Período: todo o período" : `Período: ${fmt(faixa.ini)} a ${fmt(faixa.fim)}`);
    }
    if (FILTROS[tipo].cidade) partes.push(`Cidade: ${campoCidade.value || "todas"}`);
    if (FILTROS[tipo].status) partes.push(`Status: ${campoStatus.options[campoStatus.selectedIndex].text}`);
    return partes.join(" • ") || "Geral";
  }

  function textoRelatorio(tipo, dados, filtro) {
    const largura = Math.max(80, dados.colunas.reduce((s, [, l]) => s + l, 0));
    const linha = "-".repeat(largura);
    const admin = window.amparaAdmin ? (window.amparaAdmin.nome || window.amparaAdmin.email || "ADMIN") : "ADMIN";

    const out = [
      TITULOS[tipo],
      "",
      `USUÁRIO: ${admin.toUpperCase()}`,
      linha,
      dados.colunas.map(([t, l]) => col(t, l)).join("").trimEnd(),
      linha
    ];
    if (dados.linhas.length) {
      dados.linhas.forEach((r) => out.push(r.map((v, i) => col(v, dados.colunas[i][1])).join("").trimEnd()));
    } else {
      out.push("Nenhum registro encontrado para os filtros selecionados.");
    }
    out.push(linha);
    const total = dados.total !== undefined ? dados.total : `TOTAL DE REGISTROS: ${dados.linhas.length}`;
    if (total) out.push(total);
    out.push(`DATA IMPRESSÃO: ${fmt(new Date())}`, "", `Filtro: ${filtro}`);
    return out.join("\n");
  }

  function baixarCsv(tipo, dados, filtro) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [
      [TITULOS[tipo]],
      [`Filtro: ${filtro}`],
      [`Data de emissão: ${fmt(new Date())}`],
      [],
      dados.colunas.map(([t]) => t),
      ...dados.linhas
    ];
    const csv = "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ampara-relatorio-${tipo}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // ---------- Eventos ----------

  function ajustarCampos() {
    const f = FILTROS[campoTipo.value] || { periodo: true, cidade: true };
    blocoPeriodo.classList.toggle("hidden", !f.periodo);
    blocoCidade.classList.toggle("hidden", !f.cidade);
    blocoStatus.classList.toggle("hidden", !f.status);
    blocoDatas.classList.toggle("hidden", campoPeriodo.value !== "personalizado");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    erro.textContent = "";
    const tipo = campoTipo.value;
    if (!tipo) {
      erro.textContent = "Selecione o tipo de relatório.";
      return;
    }

    btnGerar.disabled = true;
    btnGerar.textContent = "Gerando...";

    try {
      const precisaDenuncias = FILTROS[tipo].periodo;
      const denunciasTodas = precisaDenuncias ? await buscar("denuncias") : [];
      const faixa = precisaDenuncias ? intervalo(denunciasTodas) : null;
      if (faixa && faixa.erro) {
        erro.textContent = faixa.erro;
        return;
      }
      const lista = precisaDenuncias ? filtrarDenuncias(denunciasTodas, faixa) : [];

      let dados;
      if (tipo === "denuncias") dados = relDenuncias(lista);
      else if (tipo === "regiao") dados = relRegiao(lista);
      else if (tipo === "tipo") dados = relTipo(lista);
      else if (tipo === "periodo") dados = relPeriodo(lista, faixa);
      else if (tipo === "unidades") dados = relUnidades(await buscar("instituicoes"));
      else if (tipo === "usuarios") dados = relUsuarios(await buscar("Usuarios"));
      else dados = relEstatisticas(lista, await buscar("instituicoes"), await buscar("Usuarios"));

      const filtro = descreverFiltro(tipo, faixa);

      if (campoFormato.value === "csv") {
        baixarCsv(tipo, dados, filtro);
        mostrarMensagem("Planilha CSV gerada.");
      } else {
        conteudo.textContent = textoRelatorio(tipo, dados, filtro);
        resultado.classList.remove("hidden");
        resultado.scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) {
      console.error("Erro ao gerar relatório:", e);
      erro.textContent = "Não foi possível gerar o relatório. Verifique a conexão e as permissões do Firestore.";
    } finally {
      btnGerar.disabled = false;
      btnGerar.textContent = "Gerar Relatório";
    }
  });

  campoTipo.addEventListener("change", ajustarCampos);
  campoPeriodo.addEventListener("change", ajustarCampos);

  document.getElementById("relLimpar").addEventListener("click", () => {
    form.reset();
    erro.textContent = "";
    resultado.classList.add("hidden");
    ajustarCampos();
  });
  document.getElementById("relFechar").addEventListener("click", () => resultado.classList.add("hidden"));
  document.getElementById("relImprimir").addEventListener("click", () => window.print());

  document.addEventListener("ampara:pagina", (e) => {
    if (e.detail === "relatorios") carregarCidades();
  });

  ajustarCampos();
})();
