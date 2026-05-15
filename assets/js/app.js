(function () {
  const STORAGE_KEY = "offline-family-tree-v2";
  const OLD_STORAGE_KEY = "offline-family-tree-v1";
  const PANEL_STATE_KEY = "offline-family-tree-form-panel-collapsed";
  const FILES_PANEL_STATE_KEY = "offline-family-tree-files-panel-collapsed";
  const AUTH_SESSION_KEY = "offline-family-tree-edit-unlocked";
  const THEME_KEY = "offline-family-tree-theme";
  const EDIT_LOGIN = "admin";
  const EDIT_PASSWORD = "margoshvili";
  const PAN_X_KEY = "offline-family-tree-pan-x";
  const PAN_Y_KEY = "offline-family-tree-pan-y";
  const CARD_WIDTH = 210;
  const CARD_HEIGHT = 128;
  const X_START = 170;
  const Y_START = 130;
  const X_STEP = 330;
  const Y_STEP = 320;
  const CARD_GAP = 28;
  const MIN_WORLD_WIDTH = 18000;
  const MIN_WORLD_HEIGHT = 12000;
  const WORLD_PADDING = 4200;
  const HOME_ZOOM = 0.18;
  const HOME_LABEL_GUTTER = 146;
  const HOME_TOP_GUTTER = 36;

  const form = document.getElementById("personForm");
  const fields = {
    id: document.getElementById("personId"),
    fullName: document.getElementById("fullName"),
    birthYear: document.getElementById("birthYear"),
    deathYear: document.getElementById("deathYear"),
    gender: document.getElementById("gender"),
    lifeStatus: document.getElementById("lifeStatus"),
    relationType: document.getElementById("relationType"),
    relationPerson: document.getElementById("relationPerson"),
    notes: document.getElementById("notes"),
  };
  const treeCanvas = document.getElementById("treeCanvas");
  const statusLine = document.getElementById("statusLine");
  const relationSummary = document.getElementById("relationSummary");
  const template = document.getElementById("personCardTemplate");
  const clearFormButton = document.getElementById("clearFormButton");
  const deleteButton = document.getElementById("deleteButton");
  const exportButton = document.getElementById("exportButton");
  const importFile = document.getElementById("importFile");
  const searchInput = document.getElementById("searchInput");
  const fitButton = document.getElementById("fitButton");
  const zoomInButton = document.getElementById("zoomInButton");
  const zoomOutButton = document.getElementById("zoomOutButton");
  const themeButton = document.getElementById("themeButton");
  const authButton = document.getElementById("authButton");
  const zoomValue = document.getElementById("zoomValue");
  const togglePanelButton = document.getElementById("togglePanelButton");
  const openPanelButton = document.getElementById("openPanelButton");
  const toggleFilesPanelButton = document.getElementById("toggleFilesPanelButton");
  const openFilesPanelButton = document.getElementById("openFilesPanelButton");
  const mapPosition = document.getElementById("mapPosition");
  const generationLabelLayer = document.getElementById("generationLabelLayer");

  let people = loadPeople();
  let zoom = Number(localStorage.getItem("offline-family-tree-zoom")) || 1;
  let panX = Number(localStorage.getItem(PAN_X_KEY)) || 0;
  let panY = Number(localStorage.getItem(PAN_Y_KEY)) || 0;
  let worldElement = null;
  let linesElement = null;
  let canvasWasPanned = false;
  let shouldCenterSearch = false;

  function loadPeople() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      return Array.isArray(saved) ? saved.map(normalizePerson) : [];
    } catch (error) {
      console.warn("Cannot load family tree", error);
      return [];
    }
  }

  function normalizePerson(person) {
    return {
      id: person.id || createId(),
      fullName: String(person.fullName || "").trim() || "Без имени",
      birthYear: person.birthYear || "",
      deathYear: person.deathYear || "",
      parents: Array.isArray(person.parents) ? person.parents : [],
      spouses: Array.isArray(person.spouses) ? person.spouses : [],
      gender: person.gender || "",
      lifeStatus: person.lifeStatus || (person.deathYear ? "deceased" : "alive"),
      grandfather: person.grandfather || "",
      grandmother: person.grandmother || "",
      notes: person.notes || "",
      x: Number.isFinite(person.x) ? person.x : null,
      y: Number.isFinite(person.y) ? person.y : null,
    };
  }

  function savePeople() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
  }

  function createId() {
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function normalizeYear(value) {
    return value ? Number(value) : "";
  }

  function getPerson(id) {
    return people.find((person) => person.id === id);
  }

  function isEditUnlocked() {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  }

  function setEditUnlocked(unlocked) {
    document.body.classList.toggle("edit-locked", !unlocked);
    if (authButton) {
      authButton.textContent = unlocked ? "Выйти" : "Войти";
      authButton.classList.toggle("button--ghost", unlocked);
    }
    if (!unlocked) {
      deleteButton.hidden = true;
    }
  }

  function handleAuthButton() {
    if (isEditUnlocked()) {
      logoutEditMode();
      return;
    }
    requestEditLogin();
  }

  function requestEditLogin() {
    const login = window.prompt("Логин");
    if (login === null) return;
    const password = window.prompt("Пароль");
    if (password === null) return;

    if (login === EDIT_LOGIN && password === EDIT_PASSWORD) {
      sessionStorage.setItem(AUTH_SESSION_KEY, "1");
      setEditUnlocked(true);
      setFormPanelCollapsed(false);
      setFilesPanelCollapsed(false);
      render();
      return;
    }

    alert("Неверный логин или пароль.");
  }

  function logoutEditMode() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    clearForm();
    setEditUnlocked(false);
  }

  function applyTheme(theme) {
    const dark = theme === "dark";
    document.body.classList.toggle("theme-dark", dark);
    if (themeButton) {
      themeButton.textContent = dark ? "Светлая" : "Тёмная";
    }
  }

  function toggleTheme() {
    const nextTheme = document.body.classList.contains("theme-dark") ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  function clearForm() {
    form.reset();
    fields.id.value = "";
    deleteButton.hidden = true;
    updateRelationSummary(null);
    fields.fullName.focus();
    render();
  }

  function fillForm(person) {
    if (!isEditUnlocked()) return;
    setFormPanelCollapsed(false);
    fields.id.value = person.id;
    fields.fullName.value = person.fullName || "";
    fields.birthYear.value = person.birthYear || "";
    fields.deathYear.value = person.deathYear || "";
    fields.gender.value = person.gender || "";
    fields.lifeStatus.value = person.lifeStatus || (person.deathYear ? "deceased" : "alive");
    fields.relationType.value = "";
    fields.relationPerson.value = "";
    fields.notes.value = person.notes || "";
    deleteButton.hidden = false;
    updateRelationSummary(person);
    render();
  }

  function setFormPanelCollapsed(collapsed) {
    document.body.classList.toggle("form-panel-collapsed", collapsed);
    if (openPanelButton) {
      openPanelButton.hidden = !collapsed;
      openPanelButton.setAttribute("aria-expanded", String(!collapsed));
    }
    if (togglePanelButton) {
      togglePanelButton.textContent = collapsed ? "Открыть" : "Скрыть";
      togglePanelButton.setAttribute("aria-expanded", String(!collapsed));
    }
    localStorage.setItem(PANEL_STATE_KEY, collapsed ? "1" : "0");
  }

  function setFilesPanelCollapsed(collapsed) {
    document.body.classList.toggle("files-panel-collapsed", collapsed);
    if (openFilesPanelButton) {
      openFilesPanelButton.hidden = !collapsed;
      openFilesPanelButton.setAttribute("aria-expanded", String(!collapsed));
    }
    if (toggleFilesPanelButton) {
      toggleFilesPanelButton.textContent = collapsed ? "Открыть" : "Скрыть";
      toggleFilesPanelButton.setAttribute("aria-expanded", String(!collapsed));
    }
    localStorage.setItem(FILES_PANEL_STATE_KEY, collapsed ? "1" : "0");
  }

  function updateParentOptions() {
    const currentId = fields.id.value;
    const selectedRelationPerson = fields.relationPerson.value;
    const options = ['<option value="">Не указан</option>']
      .concat(
        people
          .filter((person) => person.id !== currentId)
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"))
          .map((person) => `<option value="${person.id}">${escapeHtml(person.fullName)}</option>`)
      )
      .join("");

    fields.relationPerson.innerHTML = options;
    fields.relationPerson.value = selectedRelationPerson !== currentId ? selectedRelationPerson : "";
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!isEditUnlocked()) return;

    const id = fields.id.value || createId();
    const existing = getPerson(id);
    const person = {
      id,
      fullName: fields.fullName.value.trim(),
      birthYear: normalizeYear(fields.birthYear.value),
      deathYear: normalizeYear(fields.deathYear.value),
      parents: existing?.parents || [],
      spouses: existing?.spouses || [],
      gender: fields.gender.value || existing?.gender || "",
      lifeStatus: fields.deathYear.value ? "deceased" : fields.lifeStatus.value || existing?.lifeStatus || "alive",
      grandfather: existing?.grandfather || "",
      grandmother: existing?.grandmother || "",
      notes: fields.notes.value.trim(),
      x: existing?.x ?? null,
      y: existing?.y ?? null,
    };

    if (!person.fullName) {
      fields.fullName.focus();
      return;
    }

    const existingIndex = people.findIndex((item) => item.id === id);
    if (existingIndex >= 0) {
      people[existingIndex] = person;
    } else {
      people.push(person);
      placeMissingPeople();
    }

    const changedRelation = applySelectedRelation(id);
    if (changedRelation) {
      placeMissingPeople(true);
    }

    savePeople();
    fields.id.value = id;
    deleteButton.hidden = false;
    updateRelationSummary(getPerson(id));
    render();
  }

  function applySelectedRelation(personId) {
    const relationType = fields.relationType.value;
    const relativeId = fields.relationPerson.value;
    if (!relationType || !relativeId || relativeId === personId) return false;

    if (relationType === "father") {
      setGender(relativeId, "male");
      setParentSlot(personId, relativeId, 0);
      return true;
    }

    if (relationType === "mother") {
      setGender(relativeId, "female");
      setParentSlot(personId, relativeId, 1);
      return true;
    }

    if (relationType === "husband") {
      setGender(relativeId, "male");
      setGender(personId, "female");
      attachSpouse(personId, relativeId);
      return true;
    }

    if (relationType === "wife") {
      setGender(personId, "male");
      setGender(relativeId, "female");
      attachSpouse(personId, relativeId);
      return true;
    }

    if (relationType === "son") {
      setGender(relativeId, "male");
      attachChild(personId, relativeId);
      return true;
    }

    if (relationType === "daughter") {
      setGender(relativeId, "female");
      attachChild(personId, relativeId);
      return true;
    }

    const person = getPerson(personId);
    if (!person) return false;
    if (relationType === "grandfather") {
      setGender(relativeId, "male");
      person.grandfather = relativeId;
    }
    if (relationType === "grandmother") {
      setGender(relativeId, "female");
      person.grandmother = relativeId;
    }
    return true;
  }

  function setParentSlot(childId, parentId, slot) {
    const child = getPerson(childId);
    if (!child) return;
    if (wouldCreateParentCycle(childId, parentId)) {
      alert("Такую связь нельзя добавить: получится круг, где человек становится своим же предком.");
      return;
    }
    const parents = [...(child.parents || [])];
    parents[slot] = parentId;
    child.parents = uniqueValues(parents).filter((id) => id !== childId);
  }

  function setGender(personId, gender) {
    const person = getPerson(personId);
    if (person) person.gender = gender;
  }

  function attachChild(parentId, childId) {
    const child = getPerson(childId);
    if (!child) return;

    const parents = Array.isArray(child.parents) ? [...child.parents] : [];
    if (parents.includes(parentId)) return;
    if (parents.length >= 2) {
      alert("У выбранного ребёнка уже указаны два родителя. Откройте ребёнка и измените связь отец/мать.");
      return;
    }
    if (wouldCreateParentCycle(childId, parentId)) {
      alert("Такую связь нельзя добавить: получится круг, где человек становится своим же предком.");
      return;
    }

    child.parents = parents.concat(parentId);
  }

  function wouldCreateParentCycle(childId, parentId) {
    if (childId === parentId) return true;
    const seen = new Set();

    function walkDown(id) {
      if (id === parentId) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return people
        .filter((person) => (person.parents || []).includes(id))
        .some((child) => walkDown(child.id));
    }

    return walkDown(childId);
  }

  function attachSpouse(personId, spouseId) {
    if (!spouseId || spouseId === personId) return;

    const person = getPerson(personId);
    const spouse = getPerson(spouseId);
    if (!person || !spouse) return;

    person.spouses = uniqueValues([...(person.spouses || []), spouseId]);
    spouse.spouses = uniqueValues([...(spouse.spouses || []), personId]);
  }

  function deleteSelectedPerson() {
    if (!isEditUnlocked()) return;
    const id = fields.id.value;
    if (!id) return;

    const person = getPerson(id);
    const ok = window.confirm(`Удалить "${person.fullName}"? У детей этот человек будет убран из родителей.`);
    if (!ok) return;

    people = people
      .filter((item) => item.id !== id)
      .map((item) => ({
        ...item,
        parents: (item.parents || []).filter((parentId) => parentId !== id),
        spouses: (item.spouses || []).filter((spouseId) => spouseId !== id),
        grandfather: item.grandfather === id ? "" : item.grandfather,
        grandmother: item.grandmother === id ? "" : item.grandmother,
      }));

    savePeople();
    clearForm();
  }

  function calculateGeneration(person, memo = new Map(), stack = new Set()) {
    const generations = computeGenerations();
    return generations.get(person.id) || 0;
  }

  function placeMissingPeople(force = false) {
    const generations = computeGenerations();
    const groups = new Map();

    people.forEach((person) => {
      const generation = generations.get(person.id) || 0;
      if (!groups.has(generation)) groups.set(generation, []);
      groups.get(generation).push(person);
    });

    Array.from(groups.keys()).sort((a, b) => a - b).forEach((generation) => {
      groups.get(generation).sort(sortPeopleForLayout).forEach((person, index) => {
        if (force || person.x === null || person.y === null) {
          person.x = X_START + index * X_STEP;
        }
        person.y = getGenerationY(generation);
      });
    });
    alignCouples(force);
    resolveOverlaps();
    lockPeopleToGenerationRows();
  }

  function lockPeopleToGenerationRows() {
    const generations = computeGenerations();
    people.forEach((person) => {
      person.y = getGenerationY(generations.get(person.id) || 0);
    });
  }

  function getGenerationY(generation) {
    return Y_START + generation * Y_STEP;
  }

  function computeGenerations() {
    const memo = new Map();

    function fromParents(person, stack = new Set()) {
      if (!person) return 0;
      if (memo.has(person.id)) return memo.get(person.id);
      if (stack.has(person.id)) return 0;
      stack.add(person.id);

      const parentGenerations = (person.parents || [])
        .map(getPerson)
        .filter(Boolean)
        .map((parent) => fromParents(parent, stack));
      const generation = parentGenerations.length ? Math.max(...parentGenerations) + 1 : 0;
      stack.delete(person.id);
      memo.set(person.id, generation);
      return generation;
    }

    const generations = new Map();
    people.forEach((person) => generations.set(person.id, fromParents(person)));

    getCouples().forEach((couple) => {
      const shared = Math.max(generations.get(couple.parentOne.id) || 0, generations.get(couple.parentTwo.id) || 0);
      generations.set(couple.parentOne.id, shared);
      generations.set(couple.parentTwo.id, shared);
    });

    people.forEach((person) => {
      const parentGenerations = (person.parents || [])
        .map((parentId) => generations.get(parentId))
        .filter((generation) => Number.isFinite(generation));
      if (parentGenerations.length) {
        generations.set(person.id, Math.max(generations.get(person.id) || 0, Math.max(...parentGenerations) + 1));
      }
    });

    return generations;
  }

  function alignCouples(force = false) {
    const placedRights = new Map();
    getCouples().forEach((couple) => {
      const ordered = orderCouple(couple.parentOne, couple.parentTwo);
      if (!ordered.left || !ordered.right) return;
      if (!force && ordered.left.x !== null && ordered.right.x !== null) return;

      const y = Math.min(ordered.left.y || Y_START, ordered.right.y || Y_START);
      const offset = placedRights.get(ordered.left.id) || 0;
      ordered.left.y = y;
      ordered.right.y = y;
      ordered.right.x = ordered.left.x + X_STEP + offset * X_STEP;
      placedRights.set(ordered.left.id, offset + 1);
    });
  }

  function resolveOverlaps() {
    const rows = new Map();
    people.forEach((person) => {
      const row = Math.round((person.y - Y_START) / Y_STEP);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push(person);
    });

    rows.forEach((rowPeople) => {
      let nextX = X_START;
      rowPeople
        .sort((a, b) => a.x - b.x || sortPeopleForLayout(a, b))
        .forEach((person) => {
          if (person.x < nextX) person.x = nextX;
          nextX = person.x + X_STEP;
        });
    });
  }

  function renderTree() {
    const query = searchInput.value.trim().toLowerCase();
    const matches = query ? getSearchMatches(query) : [];
    const visiblePeople = query && matches.length === 1
      ? getDownlinePeople(matches[0])
      : getVisiblePeople();
    const centerSearch = shouldCenterSearch && query && matches.length === 1 && visiblePeople.length;
    shouldCenterSearch = false;

    if (!people.length) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = 'Пока нет людей. Заполните форму слева и нажмите "Сохранить".';
      if (generationLabelLayer) generationLabelLayer.replaceChildren();
      treeCanvas.replaceChildren(generationLabelLayer, mapPosition, emptyState);
      updateMapPosition();
      statusLine.textContent = "Добавьте первого человека, чтобы начать.";
      return;
    }

    placeMissingPeople();
    savePeople();
    const worldSize = getWorldSize();

    worldElement = document.createElement("div");
    worldElement.className = "tree-world";
    worldElement.style.width = worldSize.width + "px";
    worldElement.style.height = worldSize.height + "px";
    applyWorldTransform();

    linesElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    linesElement.classList.add("tree-lines");
    linesElement.setAttribute("viewBox", `0 0 ${worldSize.width} ${worldSize.height}`);
    linesElement.style.width = worldSize.width + "px";
    linesElement.style.height = worldSize.height + "px";
    worldElement.appendChild(linesElement);

    visiblePeople.forEach((person) => {
      worldElement.appendChild(createPersonCard(person));
    });

    treeCanvas.replaceChildren(worldElement, generationLabelLayer, mapPosition);
    drawLines(visiblePeople);
    renderGenerationLabels();
    if (centerSearch) {
      centerOnPeople(visiblePeople);
    }
    updateMapPosition();
    statusLine.textContent = getStatusText(visiblePeople);
  }

  function getStatusText(visiblePeople) {
    const query = searchInput.value.trim();
    if (query && visiblePeople.length) {
      return `Показано: ${visiblePeople.length} из ${people.length}. Если найден один человек, видна его ветка вниз.`;
    }
    if (query) {
      return `По запросу "${query}" никого не найдено.`;
    }
    return `Всего людей: ${people.length}. Карточки можно перетаскивать; линии перестраиваются сами.`;
  }

  function getWorldSize() {
    const maxX = people.reduce((max, person) => Math.max(max, (person.x || 0) + CARD_WIDTH + WORLD_PADDING), 0);
    const maxY = people.reduce((max, person) => Math.max(max, (person.y || 0) + CARD_HEIGHT + WORLD_PADDING), 0);
    const rowCounts = new Map();
    const generations = computeGenerations();
    people.forEach((person) => {
      const generation = generations.get(person.id) || 0;
      rowCounts.set(generation, (rowCounts.get(generation) || 0) + 1);
    });
    const widestGeneration = Math.max(0, ...Array.from(rowCounts.values()));
    return {
      width: Math.max(MIN_WORLD_WIDTH, maxX, X_START + widestGeneration * X_STEP + WORLD_PADDING),
      height: Math.max(MIN_WORLD_HEIGHT, maxY),
    };
  }

  function resizeWorldToPeople() {
    const worldSize = getWorldSize();
    if (worldElement) {
      worldElement.style.width = worldSize.width + "px";
      worldElement.style.height = worldSize.height + "px";
    }
    if (linesElement) {
      linesElement.setAttribute("viewBox", `0 0 ${worldSize.width} ${worldSize.height}`);
      linesElement.style.width = worldSize.width + "px";
      linesElement.style.height = worldSize.height + "px";
    }
    return worldSize;
  }

  function renderGenerationLabels() {
    if (!generationLabelLayer) return;

    generationLabelLayer.replaceChildren();
    const maxGeneration = people.reduce((max, person) => Math.max(max, calculateGeneration(person)), 0);
    for (let generation = 0; generation <= maxGeneration; generation += 1) {
      const lineY = panY + (getGenerationY(generation) - 36) * zoom;
      if (lineY < -40 || lineY > treeCanvas.clientHeight + 40) continue;

      const line = document.createElement("div");
      line.className = "generation-line";
      line.style.top = lineY + "px";
      generationLabelLayer.appendChild(line);

      const label = document.createElement("div");
      label.className = "generation-label";
      label.style.setProperty("--label-scale", getGenerationLabelScale());
      label.style.top = lineY + 8 + "px";
      label.textContent = `Поколение ${generation + 1}`;
      generationLabelLayer.appendChild(label);
    }
  }

  function getGenerationLabelScale() {
    if (zoom <= 0.22) return "0.72";
    if (zoom <= 0.4) return "0.82";
    if (zoom <= 0.7) return "0.92";
    return "1";
  }

  function createPersonCard(person) {
    const node = template.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".person-card__button");
    node.dataset.personId = person.id;
    node.classList.toggle("person-card--male", person.gender === "male");
    node.classList.toggle("person-card--female", person.gender === "female");
    node.classList.toggle("person-card--deceased", isDeceased(person));
    node.style.left = person.x + "px";
    node.style.top = person.y + "px";
    node.querySelector(".person-card__name").textContent = person.fullName;
    node.querySelector(".person-card__years").textContent = formatYears(person);
    node.querySelector(".person-card__notes").textContent = person.notes || formatParents(person);
    button.classList.toggle("is-selected", fields.id.value === person.id);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    node.addEventListener("click", (event) => event.stopPropagation());
    node.addEventListener("pointerdown", (event) => startDrag(event, node, person));
    return node;
  }

  function clearFormFromCanvas(event) {
    if (!isEditUnlocked()) return;
    if (canvasWasPanned) {
      canvasWasPanned = false;
      return;
    }
    if (event.target.closest(".person-card")) return;
    clearForm();
  }

  function applyWorldTransform() {
    if (!worldElement) return;
    worldElement.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    updateMapPosition();
    renderGenerationLabels();
  }

  function updateMapPosition() {
    if (!mapPosition) return;
    const mapX = Math.round(-panX / zoom);
    const mapY = Math.round(-panY / zoom);
    mapPosition.textContent = `X ${mapX} · Y ${mapY} · ${Math.round(zoom * 100)}%`;
  }

  function startCanvasPan(event) {
    if (event.button !== 0 || event.target.closest(".person-card")) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startPanX = panX;
    const startPanY = panY;
    let moved = false;

    treeCanvas.setPointerCapture(event.pointerId);
    treeCanvas.classList.add("is-panning");

    function move(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        moved = true;
        canvasWasPanned = true;
      }

      panX = startPanX + dx;
      panY = startPanY + dy;
      applyWorldTransform();
    }

    function end() {
      treeCanvas.classList.remove("is-panning");
      treeCanvas.releasePointerCapture(event.pointerId);
      treeCanvas.removeEventListener("pointermove", move);
      treeCanvas.removeEventListener("pointerup", end);
      treeCanvas.removeEventListener("pointercancel", end);
      if (!moved) {
        canvasWasPanned = false;
      }
      localStorage.setItem(PAN_X_KEY, String(panX));
      localStorage.setItem(PAN_Y_KEY, String(panY));
    }

    treeCanvas.addEventListener("pointermove", move);
    treeCanvas.addEventListener("pointerup", end);
    treeCanvas.addEventListener("pointercancel", end);
  }

  function startDrag(event, node, person) {
    if (!isEditUnlocked()) return;
    if (event.button !== 0) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const movingPeople = getDragGroup(person);
    const generations = computeGenerations();
    const movingStarts = movingPeople.map((item) => ({
      person: item,
      node: worldElement?.querySelector(`[data-person-id="${item.id}"]`),
      x: item.x,
      y: getGenerationY(generations.get(item.id) || 0),
    }));
    let moved = false;

    node.setPointerCapture(event.pointerId);
    movingStarts.forEach((item) => item.node?.classList.add("is-dragging"));

    function move(moveEvent) {
      const dx = (moveEvent.clientX - startX) / zoom;
      const dy = (moveEvent.clientY - startY) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;

      const dragPositions = getDragPositions(movingStarts, dx);
      movingStarts.forEach((item) => {
        const position = dragPositions.get(item.person.id);
        item.person.x = position.x;
        item.person.y = item.y;
        if (item.node) {
          item.node.style.left = item.person.x + "px";
          item.node.style.top = item.person.y + "px";
        }
      });

      resizeWorldToPeople();
      drawLines();
    }

    function end() {
      const shouldSelect = !moved;
      movingStarts.forEach((item) => item.node?.classList.remove("is-dragging"));
      node.releasePointerCapture(event.pointerId);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      savePeople();
      if (moved) {
        event.preventDefault();
      } else if (shouldSelect) {
        fillForm(person);
      }
    }

    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  function getDragPositions(movingStarts, dx) {
    const movingIds = new Set(movingStarts.map((item) => item.person.id));
    const rows = new Map();
    const positions = new Map();

    movingStarts.forEach((item) => {
      if (!rows.has(item.y)) rows.set(item.y, []);
      rows.get(item.y).push(item);
    });

    rows.forEach((rowItems, rowY) => {
      const rawItems = rowItems.map((item) => ({
        item,
        rawX: Math.max(20, item.x + dx),
      }));
      const rawMinX = Math.min(...rawItems.map((item) => item.rawX));
      const rawMaxX = Math.max(...rawItems.map((item) => item.rawX + CARD_WIDTH));
      const blockWidth = rawMaxX - rawMinX;
      const obstacles = people
        .filter((person) => !movingIds.has(person.id) && Math.abs(person.y - rowY) < 1)
        .sort((a, b) => a.x - b.x);
      const blockX = findNearestFreeBlockX(rawMinX, blockWidth, obstacles);

      rawItems.forEach(({ item, rawX }) => {
        positions.set(item.person.id, {
          x: blockX + (rawX - rawMinX),
          y: item.y,
        });
      });
    });

    return positions;
  }

  function findNearestFreeBlockX(rawX, blockWidth, obstacles) {
    const minX = 20;
    const candidates = [Math.max(minX, rawX)];

    obstacles.forEach((person) => {
      candidates.push(person.x - CARD_GAP - blockWidth);
      candidates.push(person.x + CARD_WIDTH + CARD_GAP);
    });

    const validCandidates = candidates
      .map((x) => Math.max(minX, x))
      .filter((x, index, list) => list.indexOf(x) === index)
      .filter((x) => isFreeBlock(x, blockWidth, obstacles))
      .sort((a, b) => Math.abs(a - rawX) - Math.abs(b - rawX));

    if (validCandidates.length) return validCandidates[0];

    const lastObstacle = obstacles[obstacles.length - 1];
    return lastObstacle ? lastObstacle.x + CARD_WIDTH + CARD_GAP : Math.max(minX, rawX);
  }

  function isFreeBlock(x, blockWidth, obstacles) {
    return obstacles.every((person) => {
      const blockLeft = x;
      const blockRight = x + blockWidth;
      const personLeft = person.x - CARD_GAP;
      const personRight = person.x + CARD_WIDTH + CARD_GAP;
      return blockRight <= personLeft || blockLeft >= personRight;
    });
  }

  function getDragGroup(person) {
    if (person.gender !== "male") {
      return [person];
    }

    const partners = getPartners(person.id);
    return [person].concat(partners);
  }

  function drawLines(visiblePeople = null) {
    if (!linesElement) return;
    const peopleForLines = visiblePeople || getVisiblePeople();
    const visibleIds = new Set(peopleForLines.map((person) => person.id));
    linesElement.replaceChildren();

    getCouples().forEach((couple) => {
      if (!visibleIds.has(couple.parentOne.id) || !visibleIds.has(couple.parentTwo.id)) return;
      drawCouple(couple);
    });

    people.forEach((child) => {
      if (!visibleIds.has(child.id)) return;
      const parents = (child.parents || []).map(getPerson).filter(Boolean);
      if (parents.length >= 2) {
        const visibleParents = parents.filter((parent) => visibleIds.has(parent.id));
        if (visibleParents.length >= 2) {
          drawChildFromCouple(visibleParents[0], visibleParents[1], child);
          return;
        }
      }

      parents.forEach((parent) => {
        if (visibleIds.has(parent.id)) drawSingleParentRelation(parent, child);
      });
    });
  }

  function getVisiblePeople() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return people;

    const matches = getSearchMatches(query);
    if (matches.length === 1) {
      return getDownlinePeople(matches[0]);
    }
    return matches;
  }

  function getSearchMatches(query) {
    return people.filter((person) => person.fullName.toLowerCase().includes(query));
  }

  function getDownlinePeople(rootPerson) {
    const visibleIds = new Set([rootPerson.id]);
    const queue = [rootPerson.id];

    while (queue.length) {
      const parentId = queue.shift();
      getChildren(parentId).forEach((child) => {
        if (visibleIds.has(child.id)) return;
        visibleIds.add(child.id);
        queue.push(child.id);
      });
    }

    return people
      .filter((person) => visibleIds.has(person.id))
      .sort(sortPeopleForLayout);
  }

  function getPartners(personId) {
    const person = getPerson(personId);
    const partnerIds = new Set(person?.spouses || []);
    people.forEach((child) => {
      const parents = child.parents || [];
      if (parents.length >= 2 && parents.includes(personId)) {
        parents.forEach((parentId) => {
          if (parentId !== personId) partnerIds.add(parentId);
        });
      }
    });
    return Array.from(partnerIds).map(getPerson).filter(Boolean);
  }

  function getCouples() {
    const couples = new Map();

    people.forEach((person) => {
      (person.spouses || []).forEach((spouseId) => {
        const spouse = getPerson(spouseId);
        if (!spouse) return;
        const ids = [person.id, spouse.id].sort();
        const key = ids.join("::");
        if (!couples.has(key)) {
          couples.set(key, {
            parentOne: getPerson(ids[0]),
            parentTwo: getPerson(ids[1]),
            children: [],
          });
        }
      });
    });

    people.forEach((child) => {
      const parents = (child.parents || []).map(getPerson).filter(Boolean);
      if (parents.length < 2) return;
      const ids = parents.slice(0, 2).map((parent) => parent.id).sort();
      const key = ids.join("::");
      if (!couples.has(key)) {
        couples.set(key, {
          parentOne: getPerson(ids[0]),
          parentTwo: getPerson(ids[1]),
          children: [],
        });
      }
      couples.get(key).children.push(child);
    });
    return Array.from(couples.values()).filter((couple) => couple.parentOne && couple.parentTwo);
  }

  function getCenter(person) {
    return {
      x: person.x + CARD_WIDTH / 2,
      y: person.y + CARD_HEIGHT / 2,
    };
  }

  function drawCouple(couple) {
    const ordered = orderCouple(couple.parentOne, couple.parentTwo);
    const start = getRightAnchor(ordered.left);
    const end = getLeftAnchor(ordered.right);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("spouse-line");
    path.setAttribute("d", `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
    linesElement.appendChild(path);
    addDot(start.x, start.y, "spouse-dot");
    addDot(end.x, end.y, "spouse-dot");
  }

  function drawChildFromCouple(parentOne, parentTwo, child) {
    const ordered = orderCouple(parentOne, parentTwo);
    const first = getRightAnchor(ordered.left);
    const second = getLeftAnchor(ordered.right);
    const start = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    const end = getChildAnchor(child, start);
    drawCurvedLine(start, end, "child-line");
    addDot(start.x, start.y, "family-dot");
    addDot(end.x, end.y, "child-dot");
  }

  function drawSingleParentRelation(parent, child) {
    const start = getBottomAnchor(parent);
    const end = getChildAnchor(child, start);
    drawCurvedLine(start, end, "child-line");
    addDot(start.x, start.y, "family-dot");
    addDot(end.x, end.y, "child-dot");
  }

  function getChildAnchor(child, start) {
    const center = getCenter(child);
    if (start.y <= child.y) {
      return { x: center.x, y: child.y };
    }
    if (start.y >= child.y + CARD_HEIGHT) {
      return { x: center.x, y: child.y + CARD_HEIGHT };
    }
    if (start.x <= child.x) {
      return { x: child.x, y: center.y };
    }
    return { x: child.x + CARD_WIDTH, y: center.y };
  }

  function getLeftAnchor(person) {
    return { x: person.x, y: person.y + CARD_HEIGHT / 2 };
  }

  function getRightAnchor(person) {
    return { x: person.x + CARD_WIDTH, y: person.y + CARD_HEIGHT / 2 };
  }

  function getBottomAnchor(person) {
    return { x: person.x + CARD_WIDTH / 2, y: person.y + CARD_HEIGHT };
  }

  function drawCurvedLine(start, end, className) {
    const verticalDistance = end.y - start.y;
    const horizontalDistance = end.x - start.x;
    const radius = Math.min(28, Math.abs(horizontalDistance) / 2, Math.abs(verticalDistance) / 2);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add(className);

    if (Math.abs(verticalDistance) > 70 && Math.abs(horizontalDistance) > 10 && radius > 4) {
      const directionY = verticalDistance > 0 ? 1 : -1;
      const directionX = horizontalDistance > 0 ? 1 : -1;
      const preferredLane = start.y + directionY * Math.min(Math.abs(verticalDistance) * 0.55, Y_STEP / 2);
      const middleY = clamp(preferredLane, Math.min(start.y, end.y) + 56, Math.max(start.y, end.y) - 56);
      path.setAttribute(
        "d",
        [
          `M ${start.x} ${start.y}`,
          `L ${start.x} ${middleY - directionY * radius}`,
          `Q ${start.x} ${middleY} ${start.x + directionX * radius} ${middleY}`,
          `L ${end.x - directionX * radius} ${middleY}`,
          `Q ${end.x} ${middleY} ${end.x} ${middleY + directionY * radius}`,
          `L ${end.x} ${end.y}`,
        ].join(" ")
      );
    } else {
      path.setAttribute("d", `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
    }

    linesElement.appendChild(path);
  }

  function addDot(x, y, className = "family-dot") {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.classList.add(className);
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", "4");
    linesElement.appendChild(dot);
  }

  function formatYears(person) {
    if (person.birthYear && person.deathYear) return `${person.birthYear} - ${person.deathYear}`;
    if (person.birthYear) return `род. ${person.birthYear}`;
    if (person.deathYear) return `ум. ${person.deathYear}`;
    return "годы не указаны";
  }

  function isDeceased(person) {
    return person.lifeStatus === "deceased" || Boolean(person.deathYear);
  }

  function formatParents(person) {
    const names = (person.parents || []).map(getPerson).filter(Boolean).map((parent) => parent.fullName);
    return names.length ? `Родители: ${names.join(", ")}` : "Родители не указаны";
  }

  function updateRelationSummary(person) {
    if (!relationSummary) return;
    if (!person) {
      relationSummary.textContent = 'Выберите человека на дереве, чтобы увидеть его связи.';
      return;
    }

    const father = getPerson(person.parents?.[0]);
    const mother = getPerson(person.parents?.[1]);
    const spouses = (person.spouses || []).map(getPerson).filter(Boolean);
    const children = getChildren(person.id);
    const childrenText = children.length
      ? children.map((child) => formatChildWithOtherParent(person.id, child)).join(", ")
      : "не указаны";
    const grandparents = getVisibleGrandparents(person);
    const lines = [
      ["Статус", isDeceased(person) ? "умер" : "жив"],
      ["Отец", father?.fullName || "не указан"],
      ["Мать", mother?.fullName || "не указана"],
      ["Муж/жена", spouses.length ? spouses.map((item) => item.fullName).join(", ") : "не указано"],
      ["Дети", childrenText],
      ["Дедушка", getPerson(person.grandfather)?.fullName || grandparents[0]?.fullName || "не указан"],
      ["Бабушка", getPerson(person.grandmother)?.fullName || grandparents[1]?.fullName || "не указана"],
      ["Заметка", person.notes || "нет заметки"],
    ];

    relationSummary.innerHTML = lines
      .map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`)
      .join("");
  }

  function formatChildWithOtherParent(parentId, child) {
    const otherParent = (child.parents || []).find((id) => id !== parentId);
    const otherParentName = getPerson(otherParent)?.fullName;
    return otherParentName ? `${child.fullName} (${otherParentName})` : child.fullName;
  }

  function getChildren(personId) {
    return people
      .filter((person) => (person.parents || []).includes(personId))
      .sort(sortPeople);
  }

  function getVisibleGrandparents(person) {
    const stored = [person.grandfather, person.grandmother].map(getPerson).filter(Boolean);
    if (stored.length) return stored;

    const derived = [];
    (person.parents || []).map(getPerson).filter(Boolean).forEach((parent) => {
      (parent.parents || []).map(getPerson).filter(Boolean).forEach((grandparent) => {
        if (!derived.some((item) => item.id === grandparent.id)) {
          derived.push(grandparent);
        }
      });
    });
    return derived;
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function sortPeople(a, b) {
    const byYear = (a.birthYear || 9999) - (b.birthYear || 9999);
    return byYear || a.fullName.localeCompare(b.fullName, "ru");
  }

  function sortPeopleForLayout(a, b) {
    const spouseCompare = compareSpouseSide(a, b);
    if (spouseCompare) return spouseCompare;
    return sortPeople(a, b);
  }

  function compareSpouseSide(a, b) {
    if ((a.spouses || []).includes(b.id) || (b.spouses || []).includes(a.id)) {
      const ordered = orderCouple(a, b);
      if (ordered.left?.id === a.id && ordered.right?.id === b.id) return -1;
      if (ordered.left?.id === b.id && ordered.right?.id === a.id) return 1;
    }
    return 0;
  }

  function orderCouple(first, second) {
    if (!first || !second) return { left: first, right: second };
    if (first.gender === "male" && second.gender === "female") return { left: first, right: second };
    if (first.gender === "female" && second.gender === "male") return { left: second, right: first };
    return sortPeople(first, second) <= 0 ? { left: first, right: second } : { left: second, right: first };
  }

  function exportData() {
    if (!isEditUnlocked()) return;
    const data = {
      app: "offline-family-tree",
      version: 2,
      exportedAt: new Date().toISOString(),
      people,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rodoslovnoe-derevo-data.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    if (!isEditUnlocked()) return;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const importedPeople = Array.isArray(data) ? data : data.people;
        if (!Array.isArray(importedPeople)) throw new Error("Wrong format");
        people = importedPeople.map(normalizePerson);
        placeMissingPeople();
        savePeople();
        clearForm();
      } catch (error) {
        alert("Не получилось загрузить файл. Проверьте, что это JSON-файл родословного дерева.");
      }
    };
    reader.readAsText(file);
  }

  function setZoom(nextZoom, anchor = null) {
    const previousZoom = zoom;
    const next = clamp(nextZoom, 0.08, 2.5);
    if (anchor && previousZoom !== next) {
      const rect = treeCanvas.getBoundingClientRect();
      const canvasX = anchor.clientX - rect.left;
      const canvasY = anchor.clientY - rect.top;
      const worldX = (canvasX - panX) / previousZoom;
      const worldY = (canvasY - panY) / previousZoom;
      panX = canvasX - worldX * next;
      panY = canvasY - worldY * next;
      localStorage.setItem(PAN_X_KEY, String(panX));
      localStorage.setItem(PAN_Y_KEY, String(panY));
    }
    zoom = next;
    localStorage.setItem("offline-family-tree-zoom", String(zoom));
    applyWorldTransform();
    if (zoomValue) {
      zoomValue.textContent = Math.round(zoom * 100) + "%";
    }
    updateMapPosition();
  }

  function zoomMapWithWheel(event) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? 1.12 : 1 / 1.12;
    setZoom(zoom * factor, { clientX: event.clientX, clientY: event.clientY });
  }

  function centerOnPeople(targetPeople) {
    if (!targetPeople.length) return;

    const minX = Math.min(...targetPeople.map((person) => person.x));
    const minY = Math.min(...targetPeople.map((person) => person.y));
    const maxX = Math.max(...targetPeople.map((person) => person.x + CARD_WIDTH));
    const maxY = Math.max(...targetPeople.map((person) => person.y + CARD_HEIGHT));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const rect = treeCanvas.getBoundingClientRect();

    panX = rect.width / 2 - centerX * zoom;
    panY = rect.height / 2 - centerY * zoom;
    localStorage.setItem(PAN_X_KEY, String(panX));
    localStorage.setItem(PAN_Y_KEY, String(panY));
    applyWorldTransform();
  }

  function fitView() {
    const targetPeople = getVisiblePeople();
    zoom = HOME_ZOOM;
    localStorage.setItem("offline-family-tree-zoom", String(zoom));
    if (zoomValue) {
      zoomValue.textContent = Math.round(zoom * 100) + "%";
    }

    if (targetPeople.length) {
      const minX = Math.min(...targetPeople.map((person) => person.x));
      const minY = Math.min(...targetPeople.map((person) => person.y));
      panX = HOME_LABEL_GUTTER - minX * zoom;
      panY = HOME_TOP_GUTTER - minY * zoom;
    } else {
      panX = 0;
      panY = 0;
    }

    localStorage.setItem(PAN_X_KEY, String(panX));
    localStorage.setItem(PAN_Y_KEY, String(panY));
    applyWorldTransform();
  }

  function getCanvasCenterAnchor() {
    const rect = treeCanvas.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function render() {
    updateParentOptions();
    renderTree();
    if (zoomValue) {
      zoomValue.textContent = Math.round(zoom * 100) + "%";
    }
    updateMapPosition();
  }

  form.addEventListener("submit", handleSubmit);
  clearFormButton.addEventListener("click", clearForm);
  deleteButton.addEventListener("click", deleteSelectedPerson);
  exportButton.addEventListener("click", exportData);
  importFile.addEventListener("change", (event) => importData(event.target.files[0]));
  searchInput.addEventListener("input", () => {
    shouldCenterSearch = true;
    renderTree();
  });
  fitButton.addEventListener("click", fitView);
  zoomInButton.addEventListener("click", () => setZoom(zoom * 1.25, getCanvasCenterAnchor()));
  zoomOutButton.addEventListener("click", () => setZoom(zoom / 1.25, getCanvasCenterAnchor()));
  themeButton.addEventListener("click", toggleTheme);
  authButton.addEventListener("click", handleAuthButton);
  togglePanelButton.addEventListener("click", () => setFormPanelCollapsed(true));
  openPanelButton.addEventListener("click", () => setFormPanelCollapsed(false));
  toggleFilesPanelButton.addEventListener("click", () => setFilesPanelCollapsed(true));
  openFilesPanelButton.addEventListener("click", () => setFilesPanelCollapsed(false));
  treeCanvas.addEventListener("pointerdown", startCanvasPan);
  treeCanvas.addEventListener("wheel", zoomMapWithWheel, { passive: false });
  treeCanvas.addEventListener("click", clearFormFromCanvas);
  window.addEventListener("resize", renderGenerationLabels);

  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  setEditUnlocked(isEditUnlocked());
  setFormPanelCollapsed(localStorage.getItem(PANEL_STATE_KEY) === "1");
  setFilesPanelCollapsed(localStorage.getItem(FILES_PANEL_STATE_KEY) === "1");
  render();
})();
