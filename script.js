const loginForm = document.getElementById("loginForm");
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginError = document.getElementById("loginError");
const logoutButton = document.getElementById("logoutButton");
const searchInput = document.getElementById("searchInput");
const tableBody = document.getElementById("tableBody");
const statusMessage = document.getElementById("statusMessage");
const dashboardSection = document.getElementById("dashboardSection");
const denunciasSection = document.getElementById("denunciasSection");
const apoioSection = document.getElementById("apoioSection");
const relatoriosSection = document.getElementById("relatoriosSection");
const totalDenunciasEl = document.getElementById("totalDenuncias");
const analiseCountEl = document.getElementById("analiseCount");
const finalizadasCountEl = document.getElementById("finalizadasCount");
const chartBars = document.getElementById("chartBars");
const navItems = Array.from(document.querySelectorAll(".nav-item"));

let denuncias = [];
const statusOptions = ["Em análise", "Em andamento", "Concluída"];

let mensagemTimer = null;

function mostrarMensagem(texto, tipo = "success") {
  statusMessage.textContent = texto;
  statusMessage.className = `message ${tipo} show`;

  if (mensagemTimer) {
    clearTimeout(mensagemTimer);
  }

  mensagemTimer = setTimeout(() => {
    statusMessage.classList.remove("show");
  }, 3000);
}

function formatarData(valor) {
  if (!valor) return "—";

  if (typeof valor.toDate === "function") {
    return valor.toDate().toLocaleDateString("pt-BR");
  }

  return valor;
}

function renderizarTabela() {
  const termo = searchInput.value.trim().toLowerCase();

  const filtradas = denuncias.filter((item) => {
    const dados = item.dados;
    const campos = `${dados.protocolo || ""} ${dados.tipo || ""} ${dados.local || ""}`.toLowerCase();
    return campos.includes(termo);
  });

  if (!filtradas.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8">Nenhuma denúncia encontrada.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtradas
    .map((item) => {
      const dados = item.dados;
      return `
        <tr>
          <td>${dados.protocolo || "—"}</td>
          <td>${dados.tipo || "—"}</td>
          <td>${dados.relato || "—"}</td>
          <td>${dados.local || "—"}</td>
          <td>${dados.urgencia || "—"}</td>
          <td>${formatarData(dados.dataHoraOcorrencia)}</td>
          <td>
            <select class="status-select" data-id="${item.id}">
              ${statusOptions
                .map((option) => `<option value="${option}" ${dados.status === option ? "selected" : ""}>${option}</option>`)
                .join("")}
            </select>
          </td>
          <td>
            <button class="save-btn" data-id="${item.id}">Salvar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function gerarBarrasPorLocal() {
  const contagemPorLocal = {};

  denuncias.forEach((item) => {
    const local = item.dados.local || "Sem local";
    contagemPorLocal[local] = (contagemPorLocal[local] || 0) + 1;
  });

  const locaisOrdenados = Object.entries(contagemPorLocal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const maxValor = locaisOrdenados.length ? locaisOrdenados[0][1] : 1;
  chartBars.innerHTML = locaisOrdenados
    .map(([local, valor]) => {
      const largura = Math.round((valor / maxValor) * 100);
      return `
        <div class="chart-bar">
          <div>
            <p class="bar-label">${local}</p>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${largura}%;"></div>
            </div>
          </div>
          <strong>${valor}</strong>
        </div>
      `;
    })
    .join("");
}

function atualizarResumo() {
  const total = denuncias.length;
  const emAnalise = denuncias.filter((item) => item.dados.status === "Em análise").length;
  const finalizadas = denuncias.filter((item) => item.dados.status === "Concluída").length;

  totalDenunciasEl.textContent = total;
  analiseCountEl.textContent = emAnalise;
  finalizadasCountEl.textContent = finalizadas;
  gerarBarrasPorLocal();
}

function carregarDenuncias() {
  if (!window.firebaseReady || !window.firebaseDb) {
    mostrarMensagem("Configure o Firebase para carregar as denúncias.", "error");
    return;
  }

  window.firebaseDb
    .collection("denuncias")
    .orderBy("dataCriacao", "desc")
    .onSnapshot(
      (snapshot) => {
        denuncias = snapshot.docs.map((doc) => ({
          id: doc.id,
          dados: doc.data()
        }));
        renderizarTabela();
        atualizarResumo();
      },
      (erro) => {
        console.error("Erro ao buscar denúncias:", erro);
        mostrarMensagem("Não foi possível carregar as denúncias.", "error");
      }
    );
}

function autenticar(usuario, senha) {
  return usuario === "admin" && senha === "123456";
}

function definirPagina(pagina) {
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pagina);
  });

  dashboardSection.classList.toggle("hidden", pagina !== "dashboard");
  denunciasSection.classList.toggle("hidden", pagina !== "denuncias");
  apoioSection.classList.toggle("hidden", pagina !== "apoio");
  relatoriosSection.classList.toggle("hidden", pagina !== "relatorios");
}

function mostrarPainel() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  carregarDenuncias();
  definirPagina("dashboard");
}

function mostrarLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginForm.reset();
  loginError.textContent = "";
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const usuario = document.getElementById("usuario").value.trim();
  const senha = document.getElementById("senha").value.trim();

  if (autenticar(usuario, senha)) {
    mostrarPainel();
  } else {
    loginError.textContent = "Usuário ou senha inválidos.";
    loginError.className = "message error";
  }
});

logoutButton.addEventListener("click", () => {
  mostrarLogin();
});

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    const page = item.dataset.page;
    if (page === "sair") {
      mostrarLogin();
      return;
    }
    definirPagina(page);
  });
});

searchInput.addEventListener("input", renderizarTabela);

tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;

  const id = button.getAttribute("data-id");
  const select = document.querySelector(`.status-select[data-id="${id}"]`);
  const novoStatus = select.value;

  try {
    await window.firebaseDb.collection("denuncias").doc(id).update({ status: novoStatus });
    mostrarMensagem("Status atualizado com sucesso.");
  } catch (erro) {
    console.error("Erro ao atualizar status:", erro);
    mostrarMensagem("Não foi possível atualizar o status.", "error");
  }
});

mostrarLogin();
