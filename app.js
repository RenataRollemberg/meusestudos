/* Margem — anotações por curso + vocabulário universal */
(function () {
  "use strict";

  var CORES = ["c1", "c2", "c3", "c4", "c5", "c6"];
  var SUGESTOES = ["Cibersegurança", "PL-300 Power BI", "ITIL 4 Foundation"];
  var LS_DADOS = "margem.dados.v1";
  var LS_UI = "margem.ui.v1";

  var $ = function (id) { return document.getElementById(id); };

  // ---------- Estado ----------
  var itens = new Map();          // id -> objeto {kind: "curso"|"nota"|"vocab", ...}
  var modo = "carregando";        // "nuvem" | "local" | "carregando"
  var colecao = null;             // coleção privada do db
  var ui = lerUI();
  var editNota = null, editVocab = null;
  var renomeando = false, confirmaExcluir = false, escolhendoCor = false;
  var rascunhoDe = null, rascunhoTimer = null; // curso cujo rascunho está no formulário

  function lerUI() {
    try { return Object.assign({ view: "notas", curso: null }, JSON.parse(localStorage.getItem(LS_UI) || "{}")); }
    catch (e) { return { view: "notas", curso: null }; }
  }
  function salvarUI() { try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch (e) {} }

  function novoId(prefixo) {
    return prefixo + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function lista(kind) {
    var out = [];
    itens.forEach(function (v, id) { if (v.kind === kind) out.push(Object.assign({ id: id }, v)); });
    return out;
  }
  function cursos() { return lista("curso").sort(function (a, b) { return (a.criado || 0) - (b.criado || 0); }); }
  function notasDo(cursoId) {
    return lista("nota").filter(function (n) { return n.cursoId === cursoId; })
      .sort(function (a, b) { return (b.criado || 0) - (a.criado || 0); });
  }

  // ---------- Armazenamento ----------
  function aviso(txt) { var el = $("aviso"); el.textContent = txt || ""; el.hidden = !txt; }

  function persistirLocal() {
    var obj = {}; itens.forEach(function (v, k) { obj[k] = v; });
    try { localStorage.setItem(LS_DADOS, JSON.stringify(obj)); }
    catch (e) { aviso("Não foi possível salvar neste navegador. Verifique se o armazenamento do site está liberado."); }
  }

  function gravar(id, obj) {
    itens.set(id, obj); render();
    if (modo === "nuvem") {
      colecao.doc(id).set(obj).catch(function (e) { erroGravacao(e); });
    } else persistirLocal();
  }
  function apagar(id) {
    itens.delete(id); render();
    if (modo === "nuvem") {
      colecao.doc(id).delete().catch(function (e) { erroGravacao(e); });
    } else persistirLocal();
  }
  function erroGravacao(e) {
    if (e && e.code === "quota_exceeded") aviso("O espaço de armazenamento encheu. Apague anotações antigas para continuar salvando.");
    else aviso("Uma alteração não foi salva. Confira sua conexão e tente de novo.");
  }

  function iniciarLocal(msg) {
    modo = "local";
    try {
      var obj = JSON.parse(localStorage.getItem(LS_DADOS) || "{}");
      Object.keys(obj).forEach(function (k) { itens.set(k, obj[k]); });
    } catch (e) {}
    aviso(msg);
    render();
  }

  // Assinatura comum: Firestore (compat) e o db do Claude entregam snap.docs, d.exists, d.data(), snap.metadata.fromCache
  function ouvir(col, opcoesFirestore) {
    var timer = setTimeout(function () { aviso("Ainda carregando suas anotações… Se demorar, confira sua conexão."); }, 10000);
    var next = function (snap) {
      itens = new Map();
      snap.docs.forEach(function (d) { if (d.exists) itens.set(d.id, d.data()); });
      if (!snap.metadata.fromCache) { clearTimeout(timer); aviso(""); }
      render();
    };
    var erro = function () {
      clearTimeout(timer);
      aviso("Não foi possível carregar suas anotações agora. Recarregue a página mais tarde.");
    };
    var unsub = opcoesFirestore ? col.onSnapshot(opcoesFirestore, next, erro) : col.onSnapshot(next, erro);
    return function () { clearTimeout(timer); unsub(); };
  }

  function configFirebaseOk() {
    var cfg = window.FIREBASE_CONFIG;
    return !!(window.firebase && cfg && cfg.apiKey && cfg.appId && !/COLE_AQUI/.test(cfg.apiKey + cfg.appId));
  }

  function iniciarFirebase() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    var auth = firebase.auth(), fs = firebase.firestore();
    try { fs.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
    var pararDeOuvir = null;

    $("btn-login").addEventListener("click", function () {
      var p = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(p).catch(function (e) {
        if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) auth.signInWithRedirect(p);
        else if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request")
          aviso("Não foi possível entrar com o Google (" + (e.code || "erro") + "). Tente de novo.");
      });
    });
    $("btn-sair").addEventListener("click", function () { salvarRascunhoAgora(); auth.signOut(); });

    auth.onAuthStateChanged(function (u) {
      if (pararDeOuvir) { pararDeOuvir(); pararDeOuvir = null; }
      itens = new Map(); rascunhoDe = null; colecao = null;
      document.body.classList.toggle("sem-login", !u);
      $("login").hidden = !!u;
      $("btn-sair").hidden = !u;
      if (!u) { modo = "carregando"; aviso(""); render(); return; }
      modo = "nuvem";
      colecao = fs.collection("users").doc(u.uid).collection("itens");
      pararDeOuvir = ouvir(colecao, { includeMetadataChanges: true });
    });
  }

  async function iniciar() {
    render();
    if (window.FIREBASE_CONFIG && !configFirebaseOk()) {
      iniciarLocal("O Firebase ainda não foi configurado (arquivo firebase-config.js). Por enquanto, as anotações ficam só neste navegador.");
      return;
    }
    if (configFirebaseOk()) { iniciarFirebase(); return; }
    var c = window.claude;
    if (!c || typeof c.use !== "function") {
      iniciarLocal("Abra pelo Claude para guardar suas anotações na sua conta. Por enquanto, elas ficam só neste navegador.");
      return;
    }
    var db = null, user = null, uid = null;
    try {
      var r = await Promise.all([c.use("db"), c.use("user")]);
      db = r[0]; user = r[1];
      uid = user ? await user.id() : null;
    } catch (e) {}
    if (!db || !uid) {
      iniciarLocal("Entre na sua conta Claude para guardar as anotações na nuvem. Por enquanto, elas ficam só neste navegador.");
      return;
    }
    modo = "nuvem";
    colecao = db.collection("data/users/" + uid);
    ouvir(colecao);
  }

  // ---------- Backup (copiar / colar) ----------
  var KINDS = { curso: 1, nota: 1, vocab: 1, rascunho: 1 };
  function textoBackup() {
    var obj = { app: "margem", versao: 1, exportado: new Date().toISOString(), itens: {} };
    itens.forEach(function (v, k) { obj.itens[k] = v; });
    return JSON.stringify(obj);
  }
  function msgBackup(t) { $("backup-msg").textContent = t; }
  $("backup-copiar").addEventListener("click", function () {
    var txt = textoBackup(), area = $("backup-texto");
    var mostrar = function () { area.value = txt; area.focus(); area.select(); msgBackup("Selecionei os dados no campo abaixo. Copie e guarde."); };
    try {
      navigator.clipboard.writeText(txt).then(function () {
        msgBackup("Dados copiados (" + plural(itens.size, "item", "itens") + "). Cole no Margem novo e toque em Importar.");
      }, mostrar);
    } catch (e) { mostrar(); }
  });
  $("backup-importar").addEventListener("click", function () {
    var bruto = $("backup-texto").value.trim();
    if (!bruto) { msgBackup("Cole os dados copiados no campo acima antes de importar."); return; }
    if (modo === "carregando") { msgBackup("Entre na sua conta antes de importar."); return; }
    var obj;
    try { obj = JSON.parse(bruto); } catch (e) { msgBackup("Esse texto não é um backup do Margem. Copie de novo, sem cortar o começo nem o fim."); return; }
    var lista = obj && obj.itens;
    if (!lista || typeof lista !== "object") { msgBackup("Esse texto não é um backup do Margem."); return; }
    var novos = 0, iguais = 0;
    Object.keys(lista).forEach(function (id) {
      var v = lista[id];
      if (!/^[crnv]-[A-Za-z0-9-]+$/.test(id) || !v || !KINDS[v.kind]) return;
      if (itens.has(id)) { iguais++; return; }
      gravar(id, v); novos++;
    });
    $("backup-texto").value = "";
    msgBackup(novos ? "Importei " + plural(novos, "item", "itens") + (iguais ? " (" + iguais + " já existiam)." : ".") : "Nada novo para importar: tudo já estava aqui.");
  });

  // ---------- Utilitários de DOM ----------
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (k === "style") n.setAttribute("style", attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f != null) n.appendChild(typeof f === "string" ? document.createTextNode(f) : f); });
    return n;
  }
  function norm(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function realce(texto, termo) {
    var frag = document.createDocumentFragment();
    texto = texto || "";
    if (!termo) { frag.appendChild(document.createTextNode(texto)); return frag; }
    var n = norm(texto), t = norm(termo), i = 0, j;
    while ((j = n.indexOf(t, i)) !== -1) {
      frag.appendChild(document.createTextNode(texto.slice(i, j)));
      frag.appendChild(el("mark", { text: texto.slice(j, j + t.length) }));
      i = j + t.length;
    }
    frag.appendChild(document.createTextNode(texto.slice(i)));
    return frag;
  }
  function data(ms) {
    if (!ms) return "";
    var d = new Date(ms);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  function corVar(c) { return "var(--" + (CORES.indexOf(c) >= 0 ? c : "c1") + ")"; }
  function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }

  // ---------- Render ----------
  function render() {
    $("aba-notas").setAttribute("aria-pressed", ui.view === "notas");
    $("aba-vocab").setAttribute("aria-pressed", ui.view === "vocab");
    $("view-notas").hidden = ui.view !== "notas";
    $("view-vocab").hidden = ui.view !== "vocab";
    renderCursos();
    renderVocab();
  }

  function renderCursos() {
    var cs = cursos();
    if (modo !== "carregando" && cs.length && !cs.some(function (c) { return c.id === ui.curso; })) {
      ui.curso = cs[0].id; salvarUI();
    }
    var box = $("cursos-lista"); box.textContent = "";
    cs.forEach(function (c) {
      box.appendChild(el("button", {
        type: "button", class: "curso-chip", role: "listitem",
        "aria-pressed": c.id === ui.curso, style: "--cor:" + corVar(c.cor),
        onclick: function () {
          if (ui.curso === c.id) return;
          salvarRascunhoAgora();
          ui.curso = c.id; salvarUI();
          cancelarNota(); renomeando = confirmaExcluir = escolhendoCor = false;
          $("nota-busca").value = "";
          render();
        }
      }, [el("span", { class: "ponto" }), c.nome, el("span", { class: "qtd", text: String(notasDo(c.id).length) })]));
    });

    // sugestões só quando ainda não há cursos
    var nomes = cs.map(function (c) { return norm(c.nome); });
    var sug = SUGESTOES.filter(function (s) { return nomes.indexOf(norm(s)) === -1; });
    $("sugestoes").hidden = modo === "carregando" || cs.length > 0 || !sug.length;
    var sl = $("sugestoes-lista"); sl.textContent = "";
    sug.forEach(function (s) { sl.appendChild(el("button", { type: "button", class: "sug", text: "+ " + s, onclick: function () { criarCurso(s); } })); });

    var atual = itens.get(ui.curso);
    $("sem-curso").hidden = modo === "carregando" || cs.length > 0;
    $("curso-area").hidden = !atual;
    if (!atual) return;
    if (rascunhoDe !== ui.curso && !editNota) carregarRascunho(ui.curso);
    renderCabeca(Object.assign({ id: ui.curso }, atual));
    renderNotas();
  }

  function renderCabeca(c) {
    var box = $("curso-cabeca");
    if (renomeando && $("renomear-input")) return; // não apagar o que está sendo digitado
    box.textContent = "";
    box.style.setProperty("--cor", corVar(c.cor));
    var qtd = notasDo(c.id).length;

    if (renomeando) {
      var inp = el("input", { id: "renomear-input", maxlength: "60", value: c.nome, "aria-label": "Novo nome do curso" });
      var f = el("form", { class: "curso-novo", onsubmit: function (e) {
        e.preventDefault();
        var nome = inp.value.trim();
        renomeando = false;
        if (nome && nome !== c.nome) gravar(c.id, Object.assign({}, itens.get(c.id), { nome: nome }));
        else render();
      } }, [inp, el("button", { type: "submit", class: "btn btn-pri", text: "Salvar" }),
        el("button", { type: "button", class: "btn btn-sec", text: "Cancelar", onclick: function () { renomeando = false; render(); } })]);
      box.appendChild(f);
      setTimeout(function () { inp.focus(); inp.select(); }, 0);
      return;
    }

    var cab = el("div", { class: "curso-cabeca" }, [
      el("div", null, [
        el("h1", { class: "titulo" }, [el("span", { class: "hl", text: c.nome })]),
        el("p", { class: "sub", text: qtd ? plural(qtd, "anotação", "anotações") : "Nenhuma anotação ainda" })
      ]),
      el("div", { class: "curso-ferr" }, [
        el("button", { type: "button", class: "btn-txt", text: "Renomear", onclick: function () { renomeando = true; confirmaExcluir = escolhendoCor = false; render(); } }),
        el("button", { type: "button", class: "btn-txt", text: "Cor", "aria-expanded": escolhendoCor, onclick: function () { escolhendoCor = !escolhendoCor; confirmaExcluir = false; render(); } }),
        el("button", { type: "button", class: "btn-txt perigo", text: "Excluir curso", onclick: function () { confirmaExcluir = true; escolhendoCor = false; render(); } })
      ])
    ]);
    box.appendChild(cab);

    if (escolhendoCor) {
      var cores = el("div", { class: "cores", role: "group", "aria-label": "Cor do curso", style: "margin-top:10px" });
      CORES.forEach(function (k) {
        cores.appendChild(el("button", { type: "button", class: "cor-op", style: "--c:var(--" + k + ")", "aria-label": "Cor " + k.slice(1),
          "aria-pressed": (c.cor || "c1") === k,
          onclick: function () { escolhendoCor = false; gravar(c.id, Object.assign({}, itens.get(c.id), { cor: k })); } }));
      });
      box.appendChild(cores);
    }

    if (confirmaExcluir) {
      box.appendChild(el("div", { class: "confirma", style: "margin-top:12px" }, [
        el("p", { text: qtd
          ? "Excluir “" + c.nome + "” e " + plural(qtd, "anotação", "anotações") + "? Isso não pode ser desfeito. O vocabulário não é afetado."
          : "Excluir o curso “" + c.nome + "”?" }),
        el("div", { class: "acoes" }, [
          el("button", { type: "button", class: "btn btn-sec", text: "Manter curso", onclick: function () { confirmaExcluir = false; render(); } }),
          el("button", { type: "button", class: "btn btn-perigo", text: "Excluir", onclick: function () {
            confirmaExcluir = false;
            notasDo(c.id).forEach(function (n) { apagar(n.id); });
            if (itens.has(idRasc(c.id))) apagar(idRasc(c.id));
            ui.curso = null; salvarUI(); cancelarNota();
            apagar(c.id);
          } })
        ])
      ]));
    }
  }

  function renderNotas() {
    var termo = $("nota-busca").value.trim();
    var todas = notasDo(ui.curso);
    var ns = termo ? todas.filter(function (n) { return norm(n.titulo + " " + n.texto).indexOf(norm(termo)) !== -1; }) : todas;
    $("nota-contagem").textContent = termo ? ns.length + " de " + todas.length : "";
    var box = $("notas-lista"); box.textContent = "";
    if (!todas.length) {
      box.appendChild(el("div", { class: "vazio" }, [el("strong", { text: "Sua primeira anotação deste curso" }), "Use o formulário acima. Ela aparece aqui, da mais nova para a mais antiga."]));
      return;
    }
    if (!ns.length) { box.appendChild(el("div", { class: "vazio", text: "Nada encontrado para “" + termo + "”." })); return; }
    ns.forEach(function (n) {
      var titulo = n.titulo || "Sem título";
      box.appendChild(el("article", { class: "nota" }, [
        el("div", { class: "nota-topo" }, [
          el("h3", null, [realce(titulo, termo)]),
          el("time", { text: data(n.criado) + (n.editado ? " (editada)" : "") })
        ]),
        el("p", { class: "nota-texto" }, [realce(n.texto, termo)]),
        el("div", { class: "nota-pe" }, [
          el("button", { type: "button", class: "btn-txt", text: "Editar", onclick: function () { editarNota(n); } }),
          el("button", { type: "button", class: "btn-txt perigo", text: "Excluir", onclick: function (e) { confirmarInline(e.currentTarget, function () { apagar(n.id); if (editNota === n.id) cancelarNota(); }); } })
        ])
      ]));
    });
  }

  function renderVocab() {
    var termo = $("vocab-busca").value.trim();
    var todos = lista("vocab").sort(function (a, b) { return a.termo.localeCompare(b.termo, "pt-BR", { sensitivity: "base" }); });
    var vs = termo ? todos.filter(function (v) { return norm(v.termo + " " + v.significado + " " + (v.exemplo || "")).indexOf(norm(termo)) !== -1; }) : todos;
    $("vocab-contagem").textContent = termo ? vs.length + " de " + todos.length : plural(todos.length, "termo", "termos");
    var box = $("vocab-lista"); box.textContent = "";
    if (modo === "carregando") return;
    if (!todos.length) {
      box.appendChild(el("div", { class: "vazio" }, [el("strong", { text: "Seu vocabulário está vazio" }), "Adicione palavras novas que aparecerem em qualquer curso. Elas ficam em ordem alfabética."]));
      return;
    }
    if (!vs.length) { box.appendChild(el("div", { class: "vazio", text: "Nenhum termo com “" + termo + "”." })); return; }
    var letraAtual = null, grupo = null;
    vs.forEach(function (v) {
      var letra = norm(v.termo).charAt(0).toUpperCase();
      if (!/[A-Z]/.test(letra)) letra = "#";
      if (letra !== letraAtual) {
        letraAtual = letra;
        box.appendChild(el("h2", { class: "vocab-letra", text: letra }));
        grupo = el("dl", { class: "vocab-grupo" }); box.appendChild(grupo);
      }
      grupo.appendChild(el("div", { class: "termo" }, [
        el("div", { class: "termo-topo" }, [
          el("dt", null, [realce(v.termo, termo)]),
          el("div", null, [
            el("button", { type: "button", class: "btn-txt", text: "Editar", onclick: function () { editarVocab(v); } }),
            el("button", { type: "button", class: "btn-txt perigo", text: "Excluir", onclick: function (e) { confirmarInline(e.currentTarget, function () { apagar(v.id); if (editVocab === v.id) cancelarVocab(); }); } })
          ])
        ]),
        el("dd", null, [realce(v.significado, termo)]),
        v.exemplo ? el("dd", { class: "ex" }, [realce(v.exemplo, termo)]) : null
      ]));
    });
  }

  // Confirmação no próprio botão: 1º toque pede confirmação, 2º apaga
  function confirmarInline(btn, acao) {
    if (btn.dataset.confirmar === "1") { acao(); return; }
    btn.dataset.confirmar = "1";
    btn.textContent = "Confirmar exclusão";
    btn.style.color = "var(--perigo)";
    setTimeout(function () { if (btn.isConnected) { btn.dataset.confirmar = ""; btn.textContent = "Excluir"; btn.style.color = ""; } }, 4000);
  }

  // ---------- Ações ----------
  function criarCurso(nome) {
    nome = (nome || "").trim();
    if (!nome) return;
    var existente = cursos().find(function (c) { return norm(c.nome) === norm(nome); });
    if (existente) { ui.curso = existente.id; salvarUI(); render(); return; }
    var usadas = cursos().map(function (c) { return c.cor; });
    var cor = CORES.find(function (k) { return usadas.indexOf(k) === -1; }) || CORES[cursos().length % CORES.length];
    var id = novoId("c");
    ui.curso = id; salvarUI();
    gravar(id, { kind: "curso", nome: nome, cor: cor, criado: Date.now() });
  }

  // ---------- Rascunho automático (por curso) ----------
  function idRasc(cursoId) { return "r-" + cursoId; }
  function status(txt, ok) { var s = $("nota-status"); s.textContent = txt || ""; s.className = "status" + (ok ? " ok" : ""); }
  function salvarRascunhoAgora() {
    clearTimeout(rascunhoTimer); rascunhoTimer = null;
    if (editNota || !rascunhoDe || !itens.has(rascunhoDe)) return;
    var t = $("nota-titulo").value, x = $("nota-texto").value;
    var id = idRasc(rascunhoDe), atual = itens.get(id);
    if (!t.trim() && !x.trim()) { if (atual) apagar(id); status(""); return; }
    if (atual && atual.titulo === t && atual.texto === x) return;
    gravar(id, { kind: "rascunho", cursoId: rascunhoDe, titulo: t, texto: x, salvo: Date.now() });
    status("Rascunho guardado automaticamente");
  }
  function carregarRascunho(cursoId) {
    rascunhoDe = cursoId;
    var r = itens.get(idRasc(cursoId));
    $("nota-titulo").value = r ? r.titulo || "" : "";
    $("nota-texto").value = r ? r.texto || "" : "";
    status(r ? "Rascunho recuperado. Toque em Salvar anotação quando terminar." : "");
  }

  function editarNota(n) {
    salvarRascunhoAgora();
    editNota = n.id;
    $("nota-titulo").value = n.titulo || "";
    $("nota-texto").value = n.texto || "";
    $("nota-salvar").textContent = "Salvar alterações";
    $("nota-cancelar").hidden = false;
    $("form-nota").scrollIntoView({ behavior: "smooth", block: "start" });
    $("nota-texto").focus({ preventScroll: true });
  }
  function cancelarNota() {
    editNota = null;
    $("form-nota").reset();
    $("nota-salvar").textContent = "Salvar anotação";
    $("nota-cancelar").hidden = true;
    rascunhoDe = null; // o render recoloca o rascunho do curso atual, se houver
    render();
  }
  function editarVocab(v) {
    editVocab = v.id;
    $("vocab-termo").value = v.termo;
    $("vocab-sig").value = v.significado;
    $("vocab-ex").value = v.exemplo || "";
    $("vocab-salvar").textContent = "Salvar alterações";
    $("vocab-cancelar").hidden = false;
    $("form-vocab").scrollIntoView({ behavior: "smooth", block: "start" });
    $("vocab-sig").focus({ preventScroll: true });
  }
  function cancelarVocab() {
    editVocab = null;
    $("form-vocab").reset();
    $("vocab-salvar").textContent = "Adicionar ao vocabulário";
    $("vocab-cancelar").hidden = true;
  }

  // ---------- Eventos ----------
  document.querySelectorAll(".aba").forEach(function (b) {
    b.addEventListener("click", function () { ui.view = b.dataset.view; salvarUI(); render(); });
  });

  $("form-curso").addEventListener("submit", function (e) {
    e.preventDefault();
    criarCurso($("curso-nome").value);
    $("curso-nome").value = "";
  });

  $("form-nota").addEventListener("submit", function (e) {
    e.preventDefault();
    var texto = $("nota-texto").value.trim();
    if (!texto || !ui.curso) return;
    var titulo = $("nota-titulo").value.trim();
    if (editNota && itens.has(editNota)) {
      gravar(editNota, Object.assign({}, itens.get(editNota), { titulo: titulo, texto: texto, editado: Date.now() }));
    } else {
      clearTimeout(rascunhoTimer); rascunhoTimer = null;
      gravar(novoId("n"), { kind: "nota", cursoId: ui.curso, titulo: titulo, texto: texto, criado: Date.now() });
      if (itens.has(idRasc(ui.curso))) apagar(idRasc(ui.curso));
    }
    cancelarNota();
    status("Anotação salva", true);
  });
  $("nota-cancelar").addEventListener("click", cancelarNota);
  ["nota-titulo", "nota-texto"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      if (editNota) return;
      status("Escrevendo…");
      clearTimeout(rascunhoTimer);
      rascunhoTimer = setTimeout(salvarRascunhoAgora, 1200);
    });
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) salvarRascunhoAgora(); });
  window.addEventListener("pagehide", salvarRascunhoAgora);
  $("nota-busca").addEventListener("input", renderNotas);

  $("form-vocab").addEventListener("submit", function (e) {
    e.preventDefault();
    var termo = $("vocab-termo").value.trim(), sig = $("vocab-sig").value.trim();
    if (!termo || !sig) return;
    var ex = $("vocab-ex").value.trim();
    if (editVocab && itens.has(editVocab)) {
      gravar(editVocab, Object.assign({}, itens.get(editVocab), { termo: termo, significado: sig, exemplo: ex, editado: Date.now() }));
    } else {
      var dup = lista("vocab").find(function (v) { return norm(v.termo) === norm(termo); });
      if (dup) {
        aviso("“" + dup.termo + "” já está no vocabulário. Abri o termo para você editar.");
        editarVocab(dup); return;
      }
      gravar(novoId("v"), { kind: "vocab", termo: termo, significado: sig, exemplo: ex, criado: Date.now() });
    }
    cancelarVocab();
    $("vocab-termo").focus();
  });
  $("vocab-cancelar").addEventListener("click", cancelarVocab);
  $("vocab-busca").addEventListener("input", renderVocab);

  iniciar();
})();
