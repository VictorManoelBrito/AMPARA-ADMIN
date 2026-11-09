// =============================================================
// AMPARA - Painel Administrativo
// Login do administrador (Firebase Authentication), dashboard e denúncias.
// =============================================================

const loginForm = document.getElementById("loginForm");
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginError = document.getElementById("loginError");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const adminSaudacao = document.getElementById("adminSaudacao");
const searchInput = document.getElementById("searchInput");
const tableBody = document.getElementById("tableBody");
const statusMessage = document.getElementById("statusMessage");
const totalDenunciasEl = document.getElementById("totalDenuncias");
const analiseCountEl = document.getElementById("analiseCount");
const finalizadasCountEl = document.getElementById("finalizadasCount");
const chartBars = document.getElementById("chartBars");
const chartFiltro = document.getElementById("chartFiltro");
const chartHeading = document.getElementById("chartHeading");
const chartTitle = document.getElementById("chartTitle");
const navItems = Array.from(document.querySelectorAll(".nav-item"));

const secoes = {
  dashboard: document.getElementById("dashboardSection"),
  denuncias: document.getElementById("denunciasSection"),
  apoio: document.getElementById("apoioSection"),
  usuarios: document.getElementById("usuariosSection"),
  tipos: document.getElementById("tiposSection"),
  admins: document.getElementById("adminsSection"),
  relatorios: document.getElementById("relatoriosSection")
};

let denuncias = [];
let pararDenuncias = null;
const statusOptions = ["Em análise", "Em andamento", "Concluída"];
let mensagemTimer = null;

// Dados do administrador logado (disponível para os outros scripts).
window.amparaAdmin = null;

// ---------- Utilitários compartilhados ----------

// Evita que textos digitados no app (ex.: relato) sejam interpretados como HTML.
function escaparHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mostrarMensagem(texto, tipo = "success") {
  statusMessage.textContent = texto;
  statusMessage.className = `message ${tipo} show`;
  if (mensagemTimer) clearTimeout(mensagemTimer);
  mensagemTimer = setTimeout(() => statusMessage.classList.remove("show"), 3000);
}

function paraData(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;
  return null;
}

function formatarData(valor) {
  if (!valor) return "—";
  const data = paraData(valor);
  if (data) return data.toLocaleDateString("pt-BR");
  return valor;
}

// Localização aproximada: "Bairro, Cidade" (denúncias novas) ou o texto antigo.
function cidadeDaDenuncia(d) {
  if (d.cidade) return d.cidade;
  return d.local || "Não informada";
}

function localDaDenuncia(d) {
  if (d.cidade) return d.bairro ? `${d.bairro}, ${d.cidade}` : d.cidade;
  return d.local || "—";
}

function statusFinalizado(status) {
  return status === "Concluída" || status === "Finalizado";
}

// ---------- Denúncias ----------

function renderizarTabela() {
  const termo = searchInput.value.trim().toLowerCase();

  const filtradas = denuncias.filter(({ dados }) => {
    const campos = `${dados.protocolo || ""} ${dados.tipo || ""} ${localDaDenuncia(dados)}`.toLowerCase();
    return campos.includes(termo);
  });

  if (!filtradas.length) {
    tableBody.innerHTML = `<tr><td colspan="8">Nenhuma denúncia encontrada.</td></tr>`;
    return;
  }

  tableBody.innerHTML = filtradas
    .map(({ id, dados }) => `
        <tr>
          <td>${escaparHtml(dados.protocolo || "—")}${dados.anonimo ? '<br><span class="badge badge-inativo">Anônima</span>' : ""}</td>
          <td>${escaparHtml(dados.tipo || "—")}</td>
          <td class="relato-cell">${escaparHtml(dados.relato || "—")}</td>
          <td>${escaparHtml(localDaDenuncia(dados))}</td>
          <td>${escaparHtml(dados.urgencia || "—")}</td>
          <td>${escaparHtml(formatarData(dados.dataHoraOcorrencia))}</td>
          <td>
            <select class="status-select" data-id="${id}">
              ${statusOptions
                .map((op) => `<option value="${op}" ${dados.status === op ? "selected" : ""}>${op}</option>`)
                .join("")}
            </select>
          </td>
          <td>
            <button class="save-btn" data-id="${id}">Salvar</button>
            ${dados.evidenciaId || dados.evidenciaUrl
              ? `<button class="evidencia-btn" data-evidencia="${id}" type="button">Ver evidência</button>`
              : ""}
          </td>
        </tr>`)
    .join("");
}

const configuracaoGrafico = {
  cidade: { titulo: "Denúncias por cidade", sub: "Distribuição por cidade (5 maiores)", chave: (d) => cidadeDaDenuncia(d) },
  tipo: { titulo: "Denúncias por tipo", sub: "Distribuição por tipo de ocorrência (5 maiores)", chave: (d) => d.tipo || "Não informado" },
  status: { titulo: "Denúncias por status", sub: "Distribuição por status", chave: (d) => d.status || "Em análise" }
};

function gerarGrafico() {
  const config = configuracaoGrafico[chartFiltro.value] || configuracaoGrafico.cidade;
  chartHeading.textContent = config.titulo;
  chartTitle.textContent = config.sub;

  const contagem = {};
  denuncias.forEach(({ dados }) => {
    const chave = config.chave(dados);
    contagem[chave] = (contagem[chave] || 0) + 1;
  });

  const ordenados = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!ordenados.length) {
    chartBars.innerHTML = `<p class="bar-label">Nenhuma denúncia registrada ainda.</p>`;
    return;
  }

  const max = ordenados[0][1];
  chartBars.innerHTML = ordenados
    .map(([rotulo, valor]) => `
        <div class="chart-bar">
          <div>
            <p class="bar-label">${escaparHtml(rotulo)}</p>
            <div class="bar-track"><div class="bar-fill" style="width: ${Math.round((valor / max) * 100)}%;"></div></div>
          </div>
          <strong>${valor}</strong>
        </div>`)
    .join("");
}

function atualizarResumo() {
  totalDenunciasEl.textContent = denuncias.length;
  analiseCountEl.textContent = denuncias.filter(({ dados }) => (dados.status || "Em análise") === "Em análise").length;
  finalizadasCountEl.textContent = denuncias.filter(({ dados }) => statusFinalizado(dados.status)).length;
  gerarGrafico();
}

function carregarDenuncias() {
  if (pararDenuncias) return;
  pararDenuncias = window.firebaseDb
    .collection("denuncias")
    .orderBy("dataCriacao", "desc")
    .onSnapshot(
      (snapshot) => {
        denuncias = snapshot.docs.map((doc) => ({ id: doc.id, dados: doc.data() }));
        renderizarTabela();
        atualizarResumo();
      },
      (erro) => {
        console.error("Erro ao buscar denúncias:", erro);
        mostrarMensagem("Não foi possível carregar as denúncias.", "error");
      }
    );
}

// ---------- Navegação ----------

function definirPagina(pagina) {
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === pagina));
  Object.entries(secoes).forEach(([nome, el]) => el && el.classList.toggle("hidden", nome !== pagina));
  document.dispatchEvent(new CustomEvent("ampara:pagina", { detail: pagina }));
}

function mostrarPainel() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  if (window.amparaAdmin) {
    adminSaudacao.textContent = `Olá, ${window.amparaAdmin.nome || window.amparaAdmin.email}. Veja as denúncias e atualize o status com rapidez.`;
  }
  carregarDenuncias();
  definirPagina("dashboard");
}

function mostrarLogin(mensagem = "") {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginForm.reset();
  loginError.textContent = mensagem;
  loginButton.disabled = false;
  loginButton.textContent = "Entrar";
}

// ---------- Autenticação (Firebase Auth + coleção "administradores") ----------

/**
 * Um usuário só acessa o painel se existir um documento em
 * administradores/{uid} com ativo diferente de false.
 */
async function verificarAdministrador(user) {
  const doc = await window.firebaseDb.collection("administradores").doc(user.uid).get();
  if (!doc.exists || doc.data().ativo === false) return null;
  return { uid: user.uid, email: user.email, ...doc.data() };
}

function pararEscutas() {
  if (pararDenuncias) {
    pararDenuncias();
    pararDenuncias = null;
  }
  document.dispatchEvent(new CustomEvent("ampara:logout"));
}

function iniciarAutenticacao() {
  if (!window.firebaseReady || !window.firebaseAuth) {
    mostrarLogin("Não foi possível carregar o Firebase. Verifique a conexão.");
    return;
  }

  window.firebaseAuth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.amparaAdmin = null;
      pararEscutas();
      mostrarLogin(loginError.textContent);
      return;
    }

    try {
      const admin = await verificarAdministrador(user);
      if (!admin) {
        await window.firebaseAuth.signOut();
        mostrarLogin("Acesso negado: este usuário não é um administrador ativo.");
        return;
      }
      window.amparaAdmin = admin;
      mostrarPainel();
    } catch (erro) {
      console.error("Erro ao verificar administrador:", erro);
      await window.firebaseAuth.signOut();
      mostrarLogin("Não foi possível verificar o acesso. Tente novamente.");
    }
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("usuario").value.trim();
  const senha = document.getElementById("senha").value;

  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Entrando...";

  try {
    await window.firebaseAuth.signInWithEmailAndPassword(email, senha);
    // onAuthStateChanged continua o fluxo.
  } catch (erro) {
    console.warn("Falha no login:", erro.code, erro.message);
    loginError.textContent = mensagemErroLogin(erro.code);
    loginButton.disabled = false;
    loginButton.textContent = "Entrar";
  }
});

function mensagemErroLogin(codigo) {
  switch (codigo) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou senha incorretos.";
    case "auth/invalid-email":
      return "E-mail em formato inválido.";
    case "auth/user-disabled":
      return "Este usuário foi desativado no Firebase Authentication.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "auth/network-request-failed":
      return "Sem conexão com o Firebase. Verifique a internet.";
    case "auth/operation-not-allowed":
      return "O login por e-mail e senha não está habilitado no Firebase Authentication.";
    default:
      return `Não foi possível entrar (${codigo || "erro desconhecido"}).`;
  }
}

function sair() {
  loginError.textContent = "";
  window.firebaseAuth.signOut();
}

logoutButton.addEventListener("click", sair);

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    if (item.dataset.page === "sair") {
      sair();
      return;
    }
    definirPagina(item.dataset.page);
  });
});

searchInput.addEventListener("input", renderizarTabela);
chartFiltro.addEventListener("change", gerarGrafico);

// ---------- Evidência (imagem guardada na coleção "evidencias") ----------

const evidenciaModal = document.getElementById("evidenciaModal");
const evidenciaImg = document.getElementById("evidenciaImg");
const evidenciaInfo = document.getElementById("evidenciaInfo");

function fecharEvidencia() {
  evidenciaModal.classList.add("hidden");
  evidenciaImg.removeAttribute("src");
}

async function abrirEvidencia(denunciaId) {
  const item = denuncias.find((d) => d.id === denunciaId);
  if (!item) return;
  const dados = item.dados;

  evidenciaImg.removeAttribute("src");
  evidenciaInfo.textContent = `Protocolo ${dados.protocolo || "—"} • carregando imagem...`;
  evidenciaModal.classList.remove("hidden");

  try {
    if (dados.evidenciaId) {
      const doc = await window.firebaseDb.collection("evidencias").doc(dados.evidenciaId).get();
      const base64 = doc.exists ? doc.data().imagemBase64 : null;
      if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("Imagem não encontrada");
      evidenciaImg.src = `data:image/jpeg;base64,${base64}`;
      const info = doc.data();
      evidenciaInfo.textContent = `Protocolo ${dados.protocolo || "—"} • enviada em ${formatarData(info.dataEnvio)}`
        + (info.largura ? ` • ${info.largura}×${info.altura} px` : "");
    } else if (/^https:\/\//.test(dados.evidenciaUrl)) {
      // Denúncias antigas, enviadas pelo Firebase Storage
      evidenciaImg.src = dados.evidenciaUrl;
      evidenciaInfo.textContent = `Protocolo ${dados.protocolo || "—"}`;
    } else {
      throw new Error("Sem evidência");
    }
  } catch (erro) {
    console.error("Erro ao carregar evidência:", erro);
    evidenciaInfo.textContent = "Não foi possível carregar a evidência.";
  }
}

document.getElementById("evidenciaFechar").addEventListener("click", fecharEvidencia);
evidenciaModal.addEventListener("click", (e) => {
  if (e.target === evidenciaModal) fecharEvidencia();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !evidenciaModal.classList.contains("hidden")) fecharEvidencia();
});

tableBody.addEventListener("click", async (event) => {
  const botaoEvidencia = event.target.closest("button[data-evidencia]");
  if (botaoEvidencia) {
    abrirEvidencia(botaoEvidencia.dataset.evidencia);
    return;
  }

  const button = event.target.closest("button[data-id]");
  if (!button) return;

  const id = button.getAttribute("data-id");
  const select = document.querySelector(`.status-select[data-id="${id}"]`);

  try {
    await window.firebaseDb.collection("denuncias").doc(id).update({ status: select.value });
    mostrarMensagem("Status atualizado com sucesso.");
  } catch (erro) {
    console.error("Erro ao atualizar status:", erro);
    mostrarMensagem("Não foi possível atualizar o status.", "error");
  }
});

iniciarAutenticacao();
