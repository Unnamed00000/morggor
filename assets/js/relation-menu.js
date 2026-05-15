(function () {
  const STORAGE_KEY = "offline-family-tree-v2";
  const TREE_URL = "/api/tree";
  const canvas = document.getElementById("treeCanvas");
  const relationSelect = document.getElementById("relationPerson");

  if (!canvas) return;

  let peopleCache = [];
  let menu = null;

  const actions = [
    { key: "father", label: "Добавить отца", gender: "male", kind: "parent", slot: 0 },
    { key: "mother", label: "Добавить мать", gender: "female", kind: "parent", slot: 1 },
    { key: "son", label: "Добавить сына", gender: "male", kind: "child" },
    { key: "daughter", label: "Добавить дочь", gender: "female", kind: "child" },
    { key: "husband", label: "Добавить мужа", gender: "male", kind: "spouse" },
    { key: "wife", label: "Добавить жену", gender: "female", kind: "spouse" },
  ];

  function isEditUnlocked() {
    return !document.body.classList.contains("edit-locked") && !document.body.classList.contains("viewer-mode");
  }

  function createId() {
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function normalizePerson(person) {
    return {
      id: person.id || createId(),
      fullName: String(person.fullName || "").trim() || "Без имени",
      birthYear: person.birthYear || "",
      deathYear: person.deathYear || "",
      parents: Array.isArray(person.parents) ? person.parents.filter(Boolean) : [],
      spouses: Array.isArray(person.spouses) ? person.spouses.filter(Boolean) : [],
      gender: person.gender || "",
      lifeStatus: person.lifeStatus || (person.deathYear ? "deceased" : "alive"),
      grandfather: person.grandfather || "",
      grandmother: person.grandmother || "",
      notes: person.notes || "",
      x: Number.isFinite(person.x) ? person.x : null,
      y: Number.isFinite(person.y) ? person.y : null,
    };
  }

  function getPerson(id, people = peopleCache) {
    return people.find((person) => person.id === id);
  }

  async function loadPeople() {
    try {
      if (window.location.protocol !== "file:") {
        const response = await fetch(TREE_URL, { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          const loaded = Array.isArray(data) ? data : data.people;
          if (Array.isArray(loaded)) {
            peopleCache = loaded.map(normalizePerson);
            return peopleCache;
          }
        }
      }
    } catch (error) {
      console.warn("Cannot load people for relation menu", error);
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const loaded = raw ? JSON.parse(raw) : [];
      peopleCache = Array.isArray(loaded) ? loaded.map(normalizePerson) : [];
    } catch (error) {
      peopleCache = [];
    }
    return peopleCache;
  }

  async function savePeople(people) {
    const normalized = people.map(normalizePerson);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));

    if (window.location.protocol === "file:") return true;

    const response = await fetch(TREE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: "offline-family-tree",
        version: 2,
        savedAt: new Date().toISOString(),
        people: normalized,
      }),
    });

    if (response.status === 401) {
      alert("Сначала войдите через кнопку «Войти», потом можно добавлять родственников.");
      return false;
    }
    if (!response.ok) {
      alert("Не получилось сохранить на сервер. Попробуйте ещё раз.");
      return false;
    }
    return true;
  }

  function personLabel(person, people = peopleCache) {
    if (!person) return "";
    const parts = [person.fullName || "Без имени"];
    if (person.birthYear || person.deathYear) {
      parts.push(`${person.birthYear || "?"}-${person.deathYear || ""}`);
    }
    const father = getPerson(person.parents?.[0], people);
    const mother = getPerson(person.parents?.[1], people);
    if (father) parts.push(`отец: ${father.fullName}`);
    if (mother) parts.push(`мать: ${mother.fullName}`);
    return parts.join(" · ");
  }

  function decorateDuplicateNames() {
    if (!peopleCache.length) return;

    if (relationSelect) {
      Array.from(relationSelect.options).forEach((option) => {
        if (!option.value) return;
        const person = getPerson(option.value);
        if (!person) return;
        option.textContent = personLabel(person);
        option.title = personLabel(person);
      });
    }

    canvas.querySelectorAll(".person-card[data-person-id]").forEach((card) => {
      const person = getPerson(card.dataset.personId);
      if (!person) return;
      card.title = personLabel(person);
    });
  }

  function closeMenu() {
    menu?.remove();
    menu = null;
  }

  function openMenu(card) {
    if (!isEditUnlocked()) return;

    const person = getPerson(card.dataset.personId);
    if (!person) return;

    closeMenu();
    const rect = card.getBoundingClientRect();
    menu = document.createElement("div");
    menu.className = "relation-menu";
    menu.innerHTML = `
      <div class="relation-menu__title">${escapeHtml(personLabel(person))}</div>
      <div class="relation-menu__grid"></div>
    `;

    const grid = menu.querySelector(".relation-menu__grid");
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", () => addRelative(person.id, action));
      grid.appendChild(button);
    });

    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(rect.right + 10, 12), window.innerWidth - menuRect.width - 12);
    const top = Math.min(Math.max(rect.top, 12), window.innerHeight - menuRect.height - 12);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  async function addRelative(targetId, action) {
    const people = (await loadPeople()).map((person) => ({ ...person }));
    const target = getPerson(targetId, people);
    if (!target) return;

    const name = window.prompt(`${action.label}: имя и фамилия`);
    if (name === null) return;
    const fullName = name.trim();
    if (!fullName) return;

    const newPerson = normalizePerson({
      id: createId(),
      fullName,
      gender: action.gender,
      lifeStatus: "alive",
      x: getNewPersonX(target, action),
      y: getNewPersonY(target, action),
    });

    if (action.kind === "parent") {
      const parents = [...(target.parents || [])];
      if (parents[action.slot] && !window.confirm("Этот родитель уже указан. Заменить его?")) return;
      parents[action.slot] = newPerson.id;
      target.parents = uniqueValues(parents);
    }

    if (action.kind === "child") {
      const parents = [target.id];
      const secondParent = chooseSecondParent(target, people, action);
      if (secondParent) parents.push(secondParent.id);
      newPerson.parents = uniqueValues(parents);
    }

    if (action.kind === "spouse") {
      target.spouses = uniqueValues([...(target.spouses || []), newPerson.id]);
      newPerson.spouses = [target.id];
    }

    people.push(newPerson);
    const saved = await savePeople(people);
    if (saved) window.location.reload();
  }

  function chooseSecondParent(target, people, action) {
    const relationName = getSecondParentRelationName(target);
    const childName = action.key === "daughter" ? "дочери" : "сына";
    const candidates = getSecondParentCandidates(target, people);

    if (!candidates.length) {
      const newName = window.prompt(`Укажите ${relationName} для ${childName}. Если этого человека ещё нет, напишите имя и фамилию. Можно оставить пустым.`);
      return newName?.trim() ? createSecondParent(newName.trim(), target, people) : null;
    }

    const text = candidates
      .map((person, index) => `${index + 1}. ${personLabel(person, people)}`)
      .join("\n");
    const answer = window.prompt(
      `Выберите ${relationName} для ${childName}:\n${text}\n\nНапишите номер. Если нужного человека нет в списке, напишите имя и фамилию. Можно оставить пустым.`,
      candidates.length === 1 ? "1" : ""
    );
    if (!answer) return null;
    const trimmed = answer.trim();
    const index = Number(trimmed) - 1;
    if (Number.isInteger(index) && candidates[index]) return candidates[index];
    return createSecondParent(trimmed, target, people);
  }

  function getSecondParentCandidates(target, people) {
    const expectedGender = getOppositeParentGender(target);
    const candidates = getPartners(target, people);
    const candidateIds = new Set(candidates.map((person) => person.id));

    people.forEach((person) => {
      if (person.id === target.id || candidateIds.has(person.id)) return;
      if (expectedGender && person.gender !== expectedGender) return;
      candidates.push(person);
      candidateIds.add(person.id);
    });

    return candidates;
  }

  function getOppositeParentGender(target) {
    if (target.gender === "male") return "female";
    if (target.gender === "female") return "male";
    return "";
  }

  function getSecondParentRelationName(target) {
    if (target.gender === "male") return "мать";
    if (target.gender === "female") return "отца";
    return "второго родителя";
  }

  function createSecondParent(fullName, target, people) {
    const gender = getOppositeParentGender(target);
    const person = normalizePerson({
      id: createId(),
      fullName,
      gender,
      lifeStatus: "alive",
      x: gender === "male" ? Math.max(20, (target.x || 170) - 330) : (target.x || 170) + 330,
      y: Number.isFinite(target.y) ? target.y : 130,
    });
    people.push(person);
    return person;
  }

  function getPartners(target, people) {
    const ids = new Set(target.spouses || []);
    people.forEach((child) => {
      const parents = child.parents || [];
      if (parents.includes(target.id)) {
        parents.forEach((id) => {
          if (id !== target.id) ids.add(id);
        });
      }
    });
    return Array.from(ids).map((id) => getPerson(id, people)).filter(Boolean);
  }

  function getNewPersonX(target, action) {
    const baseX = Number.isFinite(target.x) ? target.x : 170;
    if (action.key === "father" || action.key === "husband") return Math.max(20, baseX - 330);
    if (action.key === "mother" || action.key === "wife") return baseX + 330;
    return baseX + 330;
  }

  function getNewPersonY(target, action) {
    const baseY = Number.isFinite(target.y) ? target.y : 130;
    if (action.kind === "parent") return Math.max(20, baseY - 320);
    if (action.kind === "child") return baseY + 320;
    return baseY;
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  canvas.addEventListener("click", async (event) => {
    const card = event.target.closest(".person-card");
    if (!card || !isEditUnlocked()) {
      closeMenu();
      return;
    }
    await loadPeople();
    decorateDuplicateNames();
    openMenu(card);
  }, true);

  document.addEventListener("click", (event) => {
    if (!menu || menu.contains(event.target) || event.target.closest(".person-card")) return;
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const observer = new MutationObserver(() => {
    loadPeople().then(decorateDuplicateNames);
  });
  observer.observe(canvas, { childList: true, subtree: true });
  if (relationSelect) observer.observe(relationSelect, { childList: true });

  loadPeople().then(decorateDuplicateNames);
})();
