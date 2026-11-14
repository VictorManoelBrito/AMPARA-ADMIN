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
const navItems = Array.from(document.querySelectorAll(".nav-item"));

const secoes = {
  dashboard: document.getElementById("dashboardSection"),
  denuncias: document.getElementById("denunciasSection"),
  apoio: document.getElementById("apoioSection"),
  usuarios: document.getElementById("usuariosSection"),
  tipos: document.getElementById("tiposSection"),
  admins: document.getElementById("adminsSection"),
  relatorios: document.getElementById("relatoriosSection"),
  movimentacoes: document.getElementById("movimentacoesSection")
};

// Páginas exclusivas do administrador (moderador não acessa)
const PAGINAS_ADMINISTRADOR = ["admins", "movimentacoes"];
let loginManual = false; // diferencia o login pelo formulário da sessão restaurada

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
    tableBody.innerHTML = `<tr><td colspan="9">Nenhuma denúncia encontrada.</td></tr>`;
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
          <td>${escaparHtml(formatarData(dados.dataCriacao))}</td>
          <td>
            <select class="status-select" data-id="${id}">
              ${statusOptions
                .map((op) => `<option value="${op}" ${dados.status === op ? "selected" : ""}>${op}</option>`)
                .join("")}
            </select>
          </td>
          <td>
            <button class="save-btn" data-id="${id}">Salvar</button>
            <button class="detalhe-btn" data-detalhe="${id}" type="button">Detalhes</button>
            ${dados.evidenciaId || dados.evidenciaUrl
              ? `<button class="evidencia-btn" data-evidencia="${id}" type="button">Ver evidência</button>`
              : ""}
          </td>
        </tr>`)
    .join("");
}

// O gráfico e os indicadores do dashboard ficam em dashboard.js
function atualizarResumo() {
  if (typeof window.atualizarDashboard === "function") {
    window.atualizarDashboard(denuncias.map((d) => d.dados));
  }
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
  if (PAGINAS_ADMINISTRADOR.includes(pagina) && !window.ehAdministrador()) pagina = "dashboard";
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === pagina));
  Object.entries(secoes).forEach(([nome, el]) => el && el.classList.toggle("hidden", nome !== pagina));
  document.dispatchEvent(new CustomEvent("ampara:pagina", { detail: pagina }));
}

function mostrarPainel() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  if (window.amparaAdmin) {
    const nivel = window.ehAdministrador() ? "Administrador" : "Moderador";
    adminSaudacao.textContent = `Olá, ${window.amparaAdmin.nome || window.amparaAdmin.email} (${nivel}). Veja as denúncias e atualize o status com rapidez.`;
  }
  // Moderador não vê Administradores nem Movimentações
  navItems.forEach((item) => {
    if (PAGINAS_ADMINISTRADOR.includes(item.dataset.page)) item.classList.toggle("hidden", !window.ehAdministrador());
  });
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
      if (loginManual) {
        loginManual = false;
        window.registrarMovimentacao("login_painel", "Entrou no painel");
      }
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
    loginManual = true;
    await window.firebaseAuth.signInWithEmailAndPassword(email, senha);
    // onAuthStateChanged continua o fluxo.
  } catch (erro) {
    loginManual = false;
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

async function sair() {
  loginError.textContent = "";
  await window.registrarMovimentacao("logout_painel", "Saiu do painel"); // precisa estar logado para gravar
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
  window.registrarMovimentacao("ver_evidencia", "Visualizou a evidência da denúncia",
    { entidade: "denuncia", entidadeId: denunciaId, referencia: dados.protocolo || null });

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

// ---------- Detalhes da denúncia (dados completos + denunciante) ----------

const detalheModal = document.getElementById("detalheModal");
const detalheConteudo = document.getElementById("detalheConteudo");
const detalheTitulo = document.getElementById("detalheTitulo");

function campo(rotulo, valor) {
  return `<div><dt>${escaparHtml(rotulo)}</dt><dd>${escaparHtml(valor || "—")}</dd></div>`;
}

function fecharDetalhe() {
  detalheModal.classList.add("hidden");
}

// Denúncias identificadas antigas não têm os dados copiados: busca no cadastro do usuário.
async function dadosDoDenunciante(dados) {
  const salvo = {
    nome: dados.nomeDenunciante,
    telefone: dados.telefoneDenunciante,
    email: dados.emailDenunciante
  };
  if ((salvo.nome && salvo.telefone && salvo.email) || !dados.usuarioId) return { ...salvo, doCadastro: false };
  try {
    const doc = await window.firebaseDb.collection("Usuarios").doc(dados.usuarioId).get();
    if (!doc.exists) return { ...salvo, doCadastro: false };
    const u = doc.data();
    return {
      nome: salvo.nome || u.nome,
      telefone: salvo.telefone || u.telefone,
      email: salvo.email || u.email,
      doCadastro: true
    };
  } catch (erro) {
    console.error("Erro ao buscar o denunciante:", erro);
    return { ...salvo, doCadastro: false };
  }
}

async function abrirDetalhe(denunciaId) {
  const item = denuncias.find((d) => d.id === denunciaId);
  if (!item) return;
  const d = item.dados;

  detalheTitulo.textContent = `Denúncia ${d.protocolo || ""}`.trim();
  detalheConteudo.innerHTML = `<p class="modal-info">Carregando...</p>`;
  detalheModal.classList.remove("hidden");
  window.registrarMovimentacao("ver_detalhes", "Visualizou os detalhes da denúncia",
    { entidade: "denuncia", entidadeId: denunciaId, referencia: d.protocolo || null });

  let blocoPessoa;
  if (d.anonimo) {
    const temContato = d.contatoConfiancaTelefone || d.contatoConfiancaNome;
    blocoPessoa = `
      <section class="detalhe-bloco">
        <h3>Denúncia anônima · contato de confiança</h3>
        ${temContato
          ? `<dl class="detalhe-grade">${campo("Nome", d.contatoConfiancaNome)}${campo("Telefone", d.contatoConfiancaTelefone)}</dl>
             <p class="detalhe-aviso">Pode ser da própria pessoa ou de um terceiro de confiança. Ao ligar, não pergunte nem revele a identidade de quem denunciou.</p>`
          : `<p class="detalhe-aviso">Nenhum contato foi informado. O acompanhamento é feito somente pelo protocolo.</p>`}
      </section>`;
  } else {
    const p = await dadosDoDenunciante(d);
    blocoPessoa = `
      <section class="detalhe-bloco">
        <h3>Denunciante</h3>
        <dl class="detalhe-grade">${campo("Nome", p.nome)}${campo("Telefone", p.telefone)}${campo("E-mail", p.email)}</dl>
        ${p.doCadastro ? `<p class="detalhe-aviso">Dados obtidos do cadastro atual do usuário.</p>` : ""}
      </section>`;
  }

  // Histórico de atendimento (somente administrador)
  const historico = await window.historicoDaDenuncia(denunciaId);
  let blocoHistorico = "";
  if (historico) {
    const itens = historico.filter((m) => ["status_denuncia", "denuncia_encaminhada", "denuncia_registrada", "denuncia_anonima"].includes(m.acao));
    blocoHistorico = `
      <section class="detalhe-bloco">
        <h3>Histórico de atendimento</h3>
        ${itens.length
          ? `<ul class="historico-lista">${itens.map((m) => `<li><strong>${escaparHtml(formatarData(m.dataHora))}</strong> · ${escaparHtml(m.perfil === "anonimo" ? "Anônimo" : (m.autorNome || "—"))}: ${escaparHtml(m.descricao || "")}</li>`).join("")}</ul>`
          : `<p class="detalhe-aviso">Nenhuma alteração registrada para esta denúncia.</p>`}
      </section>`;
  }

  // O modal pode ter sido fechado enquanto carregava
  if (detalheModal.classList.contains("hidden")) return;

  detalheConteudo.innerHTML = `
    <dl class="detalhe-grade">
      ${campo("Tipo", d.tipo)}
      ${campo("Status", d.status)}
      ${campo("Urgência", d.urgencia)}
      ${campo("Data da ocorrência", formatarData(d.dataHoraOcorrencia))}
      ${campo("Registrada em", formatarData(d.dataCriacao))}
      ${campo("Local", localDaDenuncia(d))}
    </dl>
    ${blocoPessoa}
    <section class="detalhe-bloco">
      <h3>Relato</h3>
      <p class="detalhe-relato">${escaparHtml(d.relato || "—")}</p>
    </section>
    ${blocoHistorico}
    <div class="detalhe-acoes">
      <button class="detalhe-btn" data-encaminhar="${denunciaId}" type="button">Encaminhar por e-mail</button>
      ${d.evidenciaId || d.evidenciaUrl
        ? `<button class="evidencia-btn" data-evidencia="${denunciaId}" type="button">Ver evidência</button>`
        : ""}
    </div>`;
}

document.getElementById("detalheFechar").addEventListener("click", fecharDetalhe);
detalheModal.addEventListener("click", (e) => {
  if (e.target === detalheModal) fecharDetalhe();
  const botao = e.target.closest("button[data-evidencia]");
  if (botao) abrirEvidencia(botao.dataset.evidencia);
  const botaoEnc = e.target.closest("button[data-encaminhar]");
  if (botaoEnc) {
    fecharDetalhe();
    window.abrirEncaminhamento(botaoEnc.dataset.encaminhar);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && evidenciaModal.classList.contains("hidden") && !detalheModal.classList.contains("hidden")) {
    fecharDetalhe();
  }
}, { capture: true }); // roda antes do Esc da evidência: com a evidência aberta, fecha só ela

tableBody.addEventListener("click", async (event) => {
  const botaoDetalhe = event.target.closest("button[data-detalhe]");
  if (botaoDetalhe) {
    abrirDetalhe(botaoDetalhe.dataset.detalhe);
    return;
  }

  const botaoEvidencia = event.target.closest("button[data-evidencia]");
  if (botaoEvidencia) {
    abrirEvidencia(botaoEvidencia.dataset.evidencia);
    return;
  }

  const button = event.target.closest("button[data-id]");
  if (!button) return;

  const id = button.getAttribute("data-id");
  const select = document.querySelector(`.status-select[data-id="${id}"]`);

  const item = denuncias.find((d) => d.id === id);
  const anterior = item ? item.dados.status || "Em análise" : "";
  if (select.value === anterior) {
    mostrarMensagem(`O status já é "${anterior}".`);
    return;
  }

  try {
    const lote = window.firebaseDb.batch();
    lote.update(window.firebaseDb.collection("denuncias").doc(id), { status: select.value });
    lote.set(window.firebaseDb.collection("movimentacoes").doc(), window.novaMovimentacao(
      "status_denuncia", `Status alterado de "${anterior}" para "${select.value}"`,
      { entidade: "denuncia", entidadeId: id, referencia: item ? item.dados.protocolo : null,
        detalhes: { de: anterior, para: select.value } }));
    await lote.commit();
    mostrarMensagem("Status atualizado com sucesso.");
  } catch (erro) {
    console.error("Erro ao atualizar status:", erro);
    mostrarMensagem("Não foi possível atualizar o status.", "error");
  }
});

iniciarAutenticacao();
