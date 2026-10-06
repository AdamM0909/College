(() => {
  "use strict";

  const STORAGE_KEY = "college-tracker:v1";
  const THEME_KEY = "college-tracker:theme";
  const VIEW_KEY = "college-tracker:view";

  const STATUSES = [
    { id: "researching", label: "Researching" },
    { id: "planning", label: "Planning to apply" },
    { id: "applied", label: "Applied" },
    { id: "accepted", label: "Accepted" },
    { id: "waitlisted", label: "Waitlisted" },
    { id: "rejected", label: "Rejected" },
    { id: "committed", label: "Committed" },
    { id: "dropped", label: "Not applying" },
  ];

  const DEFAULT_REQUIREMENTS = [
    "Application form",
    "Personal essay",
    "Supplemental essays",
    "Transcript",
    "Letters of recommendation",
    "Test scores (SAT/ACT)",
    "Application fee",
    "FAFSA / CSS Profile",
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colleges));
    } catch (err) {
      alert("Couldn't save to this browser's storage. Use Export to keep a backup.\n\n" + err);
    }
  }

  function getPref(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  function setPref(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }

  let colleges = load();
  let view = getPref(VIEW_KEY, "cards");
  let editingId = null;
  let draftReqs = [];
  let draftRating = 0;

  // ---------- Helpers ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const num = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const money = (n) =>
    n === null || n === undefined ? "—" : "$" + Math.round(n).toLocaleString();

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function netCost(c) {
    const t = num(c.tuition), r = num(c.roomBoard), a = num(c.aid);
    if (t === null && r === null) return null;
    return Math.max(0, (t || 0) + (r || 0) - (a || 0));
  }

  function statusOf(id) {
    return STATUSES.find((s) => s.id === id) || STATUSES[0];
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return esc(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function stars(rating) {
    const r = Math.round(num(rating) || 0);
    let html = '<span class="stars" title="' + (r ? r + " / 5" : "Not rated") + '">';
    for (let i = 1; i <= 5; i++) html += i <= r ? "★" : '<span class="off">★</span>';
    return html + "</span>";
  }

  function reqProgress(c) {
    const reqs = Array.isArray(c.requirements) ? c.requirements : [];
    const done = reqs.filter((r) => r.done).length;
    return { done, total: reqs.length };
  }

  function deadlineHtml(c) {
    const days = daysUntil(c.deadline);
    if (days === null) return "—";
    const finished = ["applied", "accepted", "waitlisted", "rejected", "committed", "dropped"].includes(c.status);
    let cls = "", hint = "";
    if (!finished) {
      if (days < 0) { cls = "deadline-past"; hint = " (passed)"; }
      else if (days <= 14) { cls = "deadline-soon"; hint = days === 0 ? " (today)" : ` (${days}d)`; }
    }
    return `<span class="${cls}">${formatDate(c.deadline)}${hint}</span>`;
  }

  // ---------- Rendering ----------
  function filtered() {
    const q = $("#search").value.trim().toLowerCase();
    const status = $("#statusFilter").value;
    const [key, dir] = $("#sortBy").value.split("-");

    let list = colleges.filter((c) => {
      if (status && c.status !== status) return false;
      if (!q) return true;
      return [c.name, c.location, c.notes, c.major, c.pros, c.cons, c.category, c.plan]
        .some((f) => String(f || "").toLowerCase().includes(q));
    });

    const val = (c) => {
      switch (key) {
        case "rating": return num(c.rating);
        case "name": return (c.name || "").toLowerCase();
        case "deadline": return c.deadline || null;
        case "cost": return netCost(c);
        case "distance": return num(c.distance);
        case "acceptance": return num(c.acceptance);
        case "updated": return c.updatedAt || 0;
      }
    };

    list.sort((a, b) => {
      const va = val(a), vb = val(b);
      // Always push empty values to the bottom.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return dir === "desc" ? -cmp : cmp;
    });
    return list;
  }

  function renderStats() {
    const total = colleges.length;
    const applied = colleges.filter((c) => ["applied", "accepted", "waitlisted", "rejected", "committed"].includes(c.status)).length;
    const accepted = colleges.filter((c) => ["accepted", "committed"].includes(c.status)).length;
    const fees = colleges
      .filter((c) => c.status !== "dropped")
      .reduce((sum, c) => sum + (num(c.appFee) || 0), 0);

    const upcoming = colleges
      .filter((c) => ["researching", "planning"].includes(c.status))
      .map((c) => ({ c, d: daysUntil(c.deadline) }))
      .filter((x) => x.d !== null && x.d >= 0)
      .sort((a, b) => a.d - b.d)[0];

    const rated = colleges.filter((c) => num(c.rating));
    const top = rated.sort((a, b) => num(b.rating) - num(a.rating))[0];

    $("#stats").innerHTML = `
      <div class="stat"><div class="label">Colleges</div><div class="value">${total}</div></div>
      <div class="stat"><div class="label">Applied</div><div class="value">${applied}</div></div>
      <div class="stat"><div class="label">Accepted</div><div class="value">${accepted}</div></div>
      <div class="stat"><div class="label">App fees total</div><div class="value">${money(fees)}</div></div>
      <div class="stat"><div class="label">Next deadline</div>
        <div class="value">${upcoming ? (upcoming.d === 0 ? "Today" : upcoming.d + "d") : "—"}</div>
        <div class="sub">${upcoming ? esc(upcoming.c.name) : "Nothing coming up"}</div>
      </div>
      <div class="stat"><div class="label">Top rated</div>
        <div class="value" style="font-size:16px">${top ? esc(top.name) : "—"}</div>
        <div class="sub">${top ? stars(top.rating) : ""}</div>
      </div>`;
  }

  function statusBadge(c) {
    const s = statusOf(c.status);
    return `<span class="badge status-badge" style="background:var(--s-${s.id})">${esc(s.label)}</span>`;
  }

  function renderCards(list) {
    const el = $("#list");
    el.className = "cards";
    el.innerHTML = list.map((c) => {
      const p = reqProgress(c);
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      return `
        <article class="card" tabindex="0" data-id="${esc(c.id)}">
          <div class="card-head">
            <div>
              <h3>${esc(c.name)}</h3>
              <div class="loc">${esc(c.location || "")}${c.distance !== "" && c.distance != null ? ` · ${esc(c.distance)} mi` : ""}</div>
            </div>
            ${stars(c.rating)}
          </div>
          <div class="badges">
            ${statusBadge(c)}
            ${c.category ? `<span class="badge">${esc(c.category)}</span>` : ""}
            ${c.plan ? `<span class="badge">${esc(c.plan)}</span>` : ""}
            ${c.type ? `<span class="badge">${esc(c.type)}</span>` : ""}
          </div>
          <dl class="facts">
            <dt>Net cost / yr</dt><dd>${money(netCost(c))}</dd>
            <dt>Deadline</dt><dd>${deadlineHtml(c)}</dd>
            <dt>Acceptance</dt><dd>${num(c.acceptance) !== null ? esc(c.acceptance) + "%" : "—"}</dd>
            <dt>App fee</dt><dd>${money(num(c.appFee))}</dd>
          </dl>
          ${p.total ? `
            <div class="progress">
              <span>Requirements</span>
              <div class="bar"><span style="width:${pct}%"></span></div>
              <span>${p.done}/${p.total}</span>
            </div>` : ""}
          ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ""}
        </article>`;
    }).join("");
  }

  function renderTable(list) {
    const el = $("#list");
    el.className = "table-wrap";
    el.innerHTML = `
      <table>
        <thead><tr>
          <th>College</th><th>Rating</th><th>Status</th><th>Category</th>
          <th>Distance</th><th>Tuition</th><th>Room &amp; board</th><th>Aid</th><th>Net cost</th>
          <th>Acceptance</th><th>Plan</th><th>Deadline</th><th>Fee</th><th>Reqs</th>
        </tr></thead>
        <tbody>
          ${list.map((c) => {
            const p = reqProgress(c);
            return `<tr data-id="${esc(c.id)}" tabindex="0">
              <td><strong>${esc(c.name)}</strong><br><small style="color:var(--muted)">${esc(c.location || "")}</small></td>
              <td>${stars(c.rating)}</td>
              <td>${statusBadge(c)}</td>
              <td>${esc(c.category || "—")}</td>
              <td class="num">${num(c.distance) !== null ? esc(c.distance) + " mi" : "—"}</td>
              <td class="num">${money(num(c.tuition))}</td>
              <td class="num">${money(num(c.roomBoard))}</td>
              <td class="num">${money(num(c.aid))}</td>
              <td class="num"><strong>${money(netCost(c))}</strong></td>
              <td class="num">${num(c.acceptance) !== null ? esc(c.acceptance) + "%" : "—"}</td>
              <td>${esc(c.plan || "—")}</td>
              <td>${deadlineHtml(c)}</td>
              <td class="num">${money(num(c.appFee))}</td>
              <td class="num">${p.total ? `${p.done}/${p.total}` : "—"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
  }

  function render() {
    renderStats();
    const list = filtered();
    $("#empty").hidden = colleges.length > 0;
    if (colleges.length && !list.length) {
      $("#list").className = "";
      $("#list").innerHTML = '<p class="empty">No colleges match your filters.</p>';
    } else if (view === "table") {
      renderTable(list);
    } else {
      renderCards(list);
    }
    $$(".view-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  }

  // ---------- Editor ----------
  const form = $("#form");
  const dialog = $("#editor");

  function renderStarInput() {
    const wrap = $("#starInput");
    let html = "";
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" role="radio" aria-checked="${i === draftRating}" aria-label="${i} star${i > 1 ? "s" : ""}"
        data-v="${i}" class="${i <= draftRating ? "on" : ""}">★</button>`;
    }
    html += `<button type="button" class="clear" data-v="0">${draftRating ? "clear" : "not rated"}</button>`;
    wrap.innerHTML = html;
    form.elements.rating.value = draftRating || "";
  }

  function renderReqs() {
    $("#reqList").innerHTML = draftReqs.map((r, i) => `
      <div class="req-item">
        <label><input type="checkbox" data-i="${i}" ${r.done ? "checked" : ""}> ${esc(r.label)}</label>
        <button type="button" class="remove" data-remove="${i}" aria-label="Remove ${esc(r.label)}">✕</button>
      </div>`).join("") || '<small style="color:var(--muted)">No requirements listed.</small>';
  }

  function updateNetCost() {
    const f = form.elements;
    const n = netCost({ tuition: f.tuition.value, roomBoard: f.roomBoard.value, aid: f.aid.value });
    $("#netCost").textContent = money(n);
  }

  function openEditor(id = null) {
    editingId = id;
    const c = id ? colleges.find((x) => x.id === id) : null;
    form.reset();
    $("#formTitle").textContent = c ? "Edit college" : "Add college";
    $("#deleteBtn").hidden = !c;

    const f = form.elements;
    if (c) {
      for (const el of f) {
        if (el.name && el.name in c && el.type !== "checkbox") el.value = c[el.name] ?? "";
      }
    } else {
      f.status.value = "researching";
    }
    draftRating = c ? Math.round(num(c.rating) || 0) : 0;
    draftReqs = c && Array.isArray(c.requirements)
      ? c.requirements.map((r) => ({ label: String(r.label), done: !!r.done }))
      : DEFAULT_REQUIREMENTS.map((label) => ({ label, done: false }));

    renderStarInput();
    renderReqs();
    updateNetCost();
    dialog.showModal();
    f.name.focus();
  }

  function closeEditor() {
    dialog.close();
    editingId = null;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const name = f.name.value.trim();
    if (!name) { f.name.focus(); return; }

    const data = {};
    for (const el of f) {
      if (el.name && el.type !== "checkbox") data[el.name] = typeof el.value === "string" ? el.value.trim() : el.value;
    }
    data.name = name;
    data.rating = draftRating || "";
    data.requirements = draftReqs;
    data.updatedAt = Date.now();

    if (editingId) {
      const i = colleges.findIndex((x) => x.id === editingId);
      colleges[i] = { ...colleges[i], ...data };
    } else {
      colleges.push({ id: uid(), createdAt: Date.now(), ...data });
    }
    save();
    closeEditor();
    render();
  });

  $("#starInput").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    draftRating = Number(b.dataset.v);
    renderStarInput();
  });

  $("#reqList").addEventListener("change", (e) => {
    const i = e.target.dataset.i;
    if (i !== undefined) draftReqs[i].done = e.target.checked;
  });
  $("#reqList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    draftReqs.splice(Number(b.dataset.remove), 1);
    renderReqs();
  });

  function addReq() {
    const input = $("#reqNew");
    const label = input.value.trim();
    if (!label) return;
    draftReqs.push({ label, done: false });
    input.value = "";
    renderReqs();
    input.focus();
  }
  $("#reqAddBtn").addEventListener("click", addReq);
  $("#reqNew").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addReq(); }
  });

  ["tuition", "roomBoard", "aid"].forEach((n) => form.elements[n].addEventListener("input", updateNetCost));

  $("#deleteBtn").addEventListener("click", () => {
    const c = colleges.find((x) => x.id === editingId);
    if (!c || !confirm(`Delete ${c.name}? This can't be undone.`)) return;
    colleges = colleges.filter((x) => x.id !== editingId);
    save();
    closeEditor();
    render();
  });

  $("#closeBtn").addEventListener("click", closeEditor);
  $("#cancelBtn").addEventListener("click", closeEditor);

  // ---------- List interactions ----------
  $("#addBtn").addEventListener("click", () => openEditor());
  $("#list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]");
    if (row) openEditor(row.dataset.id);
  });
  $("#list").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const row = e.target.closest("[data-id]");
    if (row) openEditor(row.dataset.id);
  });

  $("#search").addEventListener("input", render);
  $("#statusFilter").addEventListener("change", render);
  $("#sortBy").addEventListener("change", render);
  $$(".view-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      setPref(VIEW_KEY, view);
      render();
    })
  );

  // ---------- Import / export ----------
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), colleges }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `college-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed.colleges;
      if (!Array.isArray(incoming)) throw new Error("No colleges found in that file.");
      const clean = incoming
        .filter((c) => c && typeof c === "object" && c.name)
        .map((c) => ({ ...c, id: c.id ? String(c.id) : uid() }));

      const replace = colleges.length === 0 || confirm(
        `Import ${clean.length} college(s).\n\nOK = replace your current list\nCancel = merge into your current list`
      );
      if (replace) {
        colleges = clean;
      } else {
        const byId = new Map(colleges.map((c) => [c.id, c]));
        clean.forEach((c) => byId.set(c.id, c));
        colleges = [...byId.values()];
      }
      save();
      render();
    } catch (err) {
      alert("Couldn't import that file: " + err.message);
    }
  });

  // ---------- Theme ----------
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $("#themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
  }
  const savedTheme = getPref(THEME_KEY, null);
  applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setPref(THEME_KEY, next);
  });

  // ---------- Init ----------
  const statusOpts = STATUSES.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("");
  $("#statusFilter").innerHTML = `<option value="">All statuses</option>${statusOpts}`;
  form.elements.status.innerHTML = statusOpts;

  render();
})();
