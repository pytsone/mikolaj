"use strict";

const DB_NAME = "list-od-mikolaja";
const DB_VERSION = 1;
const STORE_NAME = "wishes";
const form = document.querySelector("#wishForm");
const nameInput = document.querySelector("#name");
const detailInput = document.querySelector("#detail");
const voiceSelect = document.querySelector("#voiceSelect");
const result = document.querySelector("#result");
const wishText = document.querySelector("#wishText");
const statusText = document.querySelector("#status");
const playButton = document.querySelector("#playButton");
const saveButton = document.querySelector("#saveButton");
const savedList = document.querySelector("#savedList");
const savedCount = document.querySelector("#savedCount");
const installButton = document.querySelector("#installButton");
let currentWish = null;
let deferredInstallPrompt = null;
let voices = [];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
    transaction.onabort = () => db.close();
  });
}
function getAllWishes() { return withStore("readonly", store => store.getAll()); }
function saveWish(wish) { return withStore("readwrite", store => store.put(wish)); }
function deleteWish(id) { return withStore("readwrite", store => store.delete(id)); }

function toVocative(name) {
  const trimmed = name.trim();
  const lower = trimmed.toLocaleLowerCase("pl-PL");
  if (lower.endsWith("sia") || lower.endsWith("cia") || lower.endsWith("zia")) return trimmed.slice(0, -1) + "u";
  if (lower.endsWith("ia")) return trimmed.slice(0, -2) + "io";
  if (lower.endsWith("a")) return trimmed.slice(0, -1) + "o";
  return trimmed;
}

function makeWish(name, detail, mood) {
  const greetingName = toVocative(name);
  const extra = detail.trim() ? `Elfy donoszą, że ${detail.trim().replace(/[.!?]+$/, "")} — i bardzo im się to podoba!` : "";
  const funny = [
    `Ho, ho, ho, ${greetingName}! Mikołaj sprawdził listę i ma ważną wiadomość: jesteś tak wspaniała, że elfy zaczęły podejrzewać, iż podkradasz im świąteczny humor. Życzę Ci prezentów trafionych lepiej niż renifer w komin, mnóstwa śmiechu i pierogów, które nie znikają z talerza, zanim usiądziesz!`,
    `Wesołych Świąt, ${greetingName}! Renifery już ruszyły, elfy zapakowały prezenty, a ja mam dla Ciebie życzenia: niech każdy dzień będzie słodszy od piernika, a świąteczne kalorie niech z szacunku do Ciebie liczą się podwójnie na minus!`,
    `Ho, ho, ho, ${greetingName}! Życzę Ci świąt pełnych radości, prezentów większych niż lista obowiązków i tak dużo odpoczynku, żeby nawet budzik uznał, że dziś nie ma z Tobą szans!`
  ];
  const warm = [
    `Kochana ${greetingName}, życzę Ci pięknych, spokojnych Świąt pełnych bliskości, ciepłych rozmów i małych chwil, które zostają w sercu na długo. Niech Nowy Rok przyniesie Ci dużo radości, zdrowia i spełnienia marzeń.`,
    `Wesołych Świąt, ${greetingName}! Niech w Twoim domu zagości spokój, przy stole nie zabraknie bliskich, a każdy dzień Nowego Roku przynosi choć jeden powód do uśmiechu.`,
    `Droga ${greetingName}, życzę Ci świąt pełnych ciepła, życzliwości i odpoczynku. Niech wszystkie dobre rzeczy, którymi dzielisz się z innymi, wrócą do Ciebie ze zdwojoną mocą.`
  ];
  const templates = mood === "warm" ? warm : funny;
  const text = templates[Math.floor(Math.random() * templates.length)];
  return extra ? `${text} ${extra}` : text;
}

function refreshVoices() {
  voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!voiceSelect) return;

  const selectedName = voiceSelect.value;
  const polishVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith("pl"));
  voiceSelect.replaceChildren(new Option("Automatycznie — niższy głos", ""));
  polishVoices.forEach(voice => voiceSelect.add(new Option(voice.name, voice.name)));
  if (polishVoices.some(voice => voice.name === selectedName)) voiceSelect.value = selectedName;
}

function findDefaultPolishVoice() {
  const polishVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith("pl"));
  const maleNameHints = /\b(male|man|męski|meski|jacek|marek|jan|adam|piotr|tomasz|michał|michal|krzysztof|paweł|pawel|andrzej)\b/i;
  return polishVoices.find(voice => maleNameHints.test(voice.name)) || polishVoices[0] || null;
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    statusText.textContent = "Ta przeglądarka nie obsługuje odczytywania tekstu.";
    return;
  }
  speechSynthesis.cancel();
  refreshVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pl-PL";
  utterance.rate = 0.82;
  utterance.pitch = 0.68;

  const selectedVoice = voices.find(voice => voice.name === voiceSelect.value);
  const voice = selectedVoice || findDefaultPolishVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => { statusText.textContent = "Mikołaj czyta życzenia…"; };
  utterance.onend = () => { statusText.textContent = ""; };
  utterance.onerror = () => { statusText.textContent = "Nie udało się odtworzyć głosu. Sprawdź ustawienia dźwięku."; };
  speechSynthesis.speak(utterance);
}

function makeSavedItem(wish) {
  const article = document.createElement("article");
  article.className = "saved-item";
  const top = document.createElement("div");
  top.className = "saved-item-top";
  const title = document.createElement("h3");
  title.textContent = `🎁 ${wish.name}`;
  const date = document.createElement("span");
  date.className = "saved-date";
  date.textContent = new Date(wish.createdAt).toLocaleDateString("pl-PL");
  top.append(title, date);
  const preview = document.createElement("p");
  preview.className = "saved-preview";
  preview.textContent = wish.text;
  const actions = document.createElement("div");
  actions.className = "saved-actions";
  const listen = document.createElement("button");
  listen.type = "button";
  listen.className = "small-button";
  listen.textContent = "🔊 Odsłuchaj";
  listen.addEventListener("click", () => speak(wish.text));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "small-button delete";
  remove.textContent = "Usuń";
  remove.setAttribute("aria-label", `Usuń życzenia dla: ${wish.name}`);
  remove.addEventListener("click", async () => { await deleteWish(wish.id); await renderSavedWishes(); });
  actions.append(listen, remove);
  article.append(top, preview, actions);
  return article;
}

async function renderSavedWishes() {
  const wishes = await getAllWishes();
  wishes.sort((a, b) => b.createdAt - a.createdAt);
  savedList.replaceChildren();
  savedCount.textContent = String(wishes.length);
  if (wishes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Zapisane życzenia pojawią się tutaj. 🎄";
    savedList.append(empty);
    return;
  }
  wishes.forEach(wish => savedList.append(makeSavedItem(wish)));
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  const mood = new FormData(form).get("mood");
  currentWish = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    text: makeWish(name, detailInput.value, mood),
    createdAt: Date.now()
  };
  wishText.textContent = currentWish.text;
  statusText.textContent = "";
  result.hidden = false;
  saveButton.disabled = false;
  saveButton.textContent = "💾 Zapisz";
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
playButton.addEventListener("click", () => { if (currentWish) speak(currentWish.text); });
saveButton.addEventListener("click", async () => {
  if (!currentWish) return;
  try {
    await saveWish(currentWish);
    saveButton.disabled = true;
    saveButton.textContent = "✓ Zapisano";
    statusText.textContent = "Życzenia zapisano na tym urządzeniu.";
    await renderSavedWishes();
  } catch {
    statusText.textContent = "Nie udało się zapisać życzeń. Sprawdź wolne miejsce w urządzeniu.";
  }
});
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
if ("speechSynthesis" in window) {
  refreshVoices();
  speechSynthesis.addEventListener("voiceschanged", refreshVoices);
}
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => {}); });
}
renderSavedWishes().catch(() => { savedList.textContent = "Nie udało się otworzyć zapisanych życzeń."; });
