// =============================================================
// AMPARA - Painel Administrativo
// Dashboard (3.1.13): indicadores e gráfico com filtros por tipo,
// cidade, período e agrupamento (região, cidade, tipo, status ou tempo).
// Gráfico com Chart.js (https://www.chartjs.org).
// =============================================================

(function () {
  const COR_BARRA = "#1E88E5";
  const COR_BARRA_HOVER = "#1565C0";
  const COR_GRADE = "#E8EEF5";
  const COR_TEXTO = "#546E7A";
  const MAX_CATEGORIAS = 10; // acima disso, o restante vira "Outras"
  const DIA = 24 * 60 * 60 * 1000;

  const el = {
    tipo: document.getElementById("dashTipo"),
    cidade: document.getElementById("dashCidade"),
    periodo: document.getElementById("dashPeriodo"),
    agrupar: document.getElementById("dashAgrupar"),
    limpar: document.getElementById("dashLimpar"),
    total: document.getElementById("totalDenuncias"),
    analise: document.getElementById("analiseCount"),
    finalizadas: document.getElementById("finalizadasCount"),
    titulo: document.getElementById("chartTitle"),
    subtitulo: document.getElementById("chartSubtitulo"),
    area: document.getElementById("chartArea"),
    canvas: document.getElementById("dashChart"),
    vazio: document.getElementById("chartVazio"),
    tabela: document.getElementById("dashTabela"),
    colunaTabela: document.getElementById("tabelaColuna")
  };

  const ROTULOS = {
    regiao: { titulo: "Denúncias por região", coluna: "Região" },
    cidade: { titulo: "Denúncias por cidade", coluna: "Cidade" },
    tipo: { titulo: "Denúncias por tipo", coluna: "Tipo" },
    status: { titulo: "Denúncias por status", coluna: "Status" },
    tempo: { titulo: "Denúncias ao longo do tempo", coluna: "Período" }
  };

  let todas = [];
  let grafico = null;

  // ---------- Dados ----------

  function regiao(d) {
    if (d.cidade) return d.bairro ? `${d.bairro} (${d.cidade})` : d.cidade;
    return d.local || "Não informada";
  }

  function chaveDe(d, agrupar) {
    if (agrupar === "regiao") return regiao(d);
    if (agrupar === "cidade") return cidadeDaDenuncia(d);
    if (agrupar === "tipo") return d.tipo || "Não informado";
    if (agrupar === "status") return statusFinalizado(d.status) ? "Concluída" : (d.status || "Em análise");
    return null;
  }

  function filtrar() {
    const tipo = el.tipo.value;
    const cidade = el.cidade.value;
    const periodo = el.periodo.value;
    const inicio = periodo === "tudo" ? null : new Date(Date.now() - parseInt(periodo, 10) * DIA);

    return todas.filter((d) => {
      if (tipo && d.tipo !== tipo) return false;
      if (cidade && cidadeDaDenuncia(d) !== cidade) return false;
      if (inicio) {
        const data = paraData(d.dataCriacao);
        if (!data || data < inicio) return false;
      }
      return true;
    });
  }

  /** Agrupa em categorias (as 10 maiores + "Outras"). */
  function agruparCategorias(lista, agrupar) {
    const contagem = {};
    lista.forEach((d) => {
      const k = chaveDe(d, agrupar);
      contagem[k] = (contagem[k] || 0) + 1;
    });
    let pares = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    if (pares.length > MAX_CATEGORIAS) {
      const resto = pares.slice(MAX_CATEGORIAS - 1).reduce((s, [, v]) => s + v, 0);
      pares = pares.slice(0, MAX_CATEGORIAS - 1).concat([["Outras", resto]]);
    }
    return pares;
  }

  /** Agrupa por dia (até 31 dias) ou por mês (períodos maiores). */
  function agruparTempo(lista) {
    const datas = lista.map((d) => paraData(d.dataCriacao)).filter(Boolean);
    const hoje = new Date();
    const periodo = el.periodo.value;
    let inicio = periodo === "tudo"
      ? (datas.length ? new Date(Math.min(...datas)) : hoje)
      : new Date(hoje.getTime() - parseInt(periodo, 10) * DIA);

    const dias = Math.ceil((hoje - inicio) / DIA);
    const pares = [];

    if (dias <= 31) {
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
      while (d <= hoje) {
        const chave = d.toDateString();
        pares.push([d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          datas.filter((x) => x.toDateString() === chave).length]);
        d.setDate(d.getDate() + 1);
      }
    } else {
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
      while (d <= hoje) {
        const m = d.getMonth(), a = d.getFullYear();
        const rotulo = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
        pares.push([rotulo, datas.filter((x) => x.getMonth() === m && x.getFullYear() === a).length]);
        d.setMonth(d.getMonth() + 1);
      }
    }
    return pares;
  }

  // ---------- Filtros ----------

  function preencherOpcoes(select, valores, rotuloTodos) {
    const atual = select.value;
    select.innerHTML = `<option value="">${rotuloTodos}</option>` +
      valores.map((v) => `<option value="${escaparHtml(v)}">${escaparHtml(v)}</option>`).join("");
    select.value = valores.includes(atual) ? atual : "";
  }

  function atualizarOpcoes() {
    const ordenar = (a, b) => a.localeCompare(b, "pt-BR");
    preencherOpcoes(el.tipo, [...new Set(todas.map((d) => d.tipo).filter(Boolean))].sort(ordenar), "Todos os tipos");
    preencherOpcoes(el.cidade, [...new Set(todas.map((d) => cidadeDaDenuncia(d)).filter(Boolean))].sort(ordenar), "Todas as cidades");
  }

  function descricaoFiltros() {
    const periodo = el.periodo.options[el.periodo.selectedIndex].text.toLowerCase();
    return `${el.tipo.value || "Todos os tipos"} • ${el.cidade.value || "todas as cidades"} • ${periodo}`;
  }

  // ---------- Desenho ----------

  function desenhar() {
    const lista = filtrar();
    const agrupar = el.agrupar.value;
    const horizontal = agrupar !== "tempo";

    // Indicadores seguem os filtros
    el.total.textContent = lista.length;
    el.analise.textContent = lista.filter((d) => (d.status || "Em análise") === "Em análise").length;
    el.finalizadas.textContent = lista.filter((d) => statusFinalizado(d.status)).length;

    el.titulo.textContent = ROTULOS[agrupar].titulo;
    el.subtitulo.textContent = descricaoFiltros();
    el.colunaTabela.textContent = ROTULOS[agrupar].coluna;

    const pares = horizontal ? agruparCategorias(lista, agrupar) : agruparTempo(lista);
    const total = lista.length;

    // Tabela com os números exatos (acessibilidade)
    el.tabela.innerHTML = pares.length
      ? pares.map(([k, v]) => `<tr><td>${escaparHtml(k)}</td><td>${v}</td><td>${total ? Math.round((v / total) * 100) : 0}%</td></tr>`).join("")
      : `<tr><td colspan="3">Sem dados.</td></tr>`;

    const semDados = total === 0;
    el.vazio.classList.toggle("hidden", !semDados);
    el.area.classList.toggle("hidden", semDados);
    if (semDados) return;

    if (typeof Chart === "undefined") {
      el.vazio.textContent = "Não foi possível carregar a biblioteca de gráficos. Verifique a internet.";
      el.vazio.classList.remove("hidden");
      return;
    }

    // Altura proporcional ao número de barras horizontais
    el.area.style.height = horizontal ? `${Math.max(180, pares.length * 38 + 50)}px` : "300px";

    const dados = {
      labels: pares.map(([k]) => k),
      datasets: [{
        label: "Denúncias",
        data: pares.map(([, v]) => v),
        backgroundColor: COR_BARRA,
        hoverBackgroundColor: COR_BARRA_HOVER,
        borderRadius: 4,
        borderSkipped: "start",
        maxBarThickness: 28
      }]
    };

    const eixoValor = {
      beginAtZero: true,
      ticks: { precision: 0, color: COR_TEXTO },
      grid: { color: COR_GRADE },
      border: { display: false }
    };
    const eixoCategoria = {
      ticks: { color: COR_TEXTO, autoSkip: !horizontal },
      grid: { display: false },
      border: { color: COR_GRADE }
    };

    const opcoes = {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      scales: horizontal ? { x: eixoValor, y: eixoCategoria } : { x: eixoCategoria, y: eixoValor },
      plugins: {
        legend: { display: false }, // uma única série: o título já a identifica
        tooltip: {
          backgroundColor: "#1F2937",
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed[horizontal ? "x" : "y"];
              const pct = total ? Math.round((v / total) * 100) : 0;
              return `${v} ${v === 1 ? "denúncia" : "denúncias"} (${pct}%)`;
            }
          }
        }
      }
    };

    if (grafico) grafico.destroy();
    grafico = new Chart(el.canvas, { type: "bar", data: dados, options: opcoes });
  }

  // ---------- Integração ----------

  window.atualizarDashboard = function (lista) {
    todas = lista || [];
    atualizarOpcoes();
    desenhar();
  };

  [el.tipo, el.cidade, el.periodo, el.agrupar].forEach((s) => s.addEventListener("change", desenhar));
  el.limpar.addEventListener("click", () => {
    el.tipo.value = "";
    el.cidade.value = "";
    el.periodo.value = "tudo";
    el.agrupar.value = "regiao";
    desenhar();
  });

  document.addEventListener("ampara:logout", () => {
    if (grafico) grafico.destroy();
    grafico = null;
    todas = [];
  });
})();
