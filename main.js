import DOMPurify from "dompurify";

export function activate(context) {
  const { ui, data, app, reader, storage } = context;

  // 0. Inject Styles
  const styleId = "plugin-translation-styles";
  if (!document.getElementById(styleId)) {
    const link = document.createElement("link");
    link.id = styleId;
    link.rel = "stylesheet";
    link.href = "./styles.css";
    document.head.appendChild(link);
  }

  // 1. Settings (Target Language)
  ui.settings.addSection("tab-general", "Translation", async (container) => {
    const label = document.createElement("label");
    label.textContent = "Target Language";
    label.className = "modal-label";

    const select = document.createElement("select");
    select.className = "modal-input";

    const langs = [
      { code: "en", name: "English" },
      { code: "es", name: "Spanish" },
      { code: "fr", name: "French" },
      { code: "de", name: "German" },
      { code: "it", name: "Italian" },
      { code: "pt", name: "Portuguese" },
      { code: "nl", name: "Dutch" },
      { code: "ru", name: "Russian" },
      { code: "zh", name: "Chinese" },
      { code: "ja", name: "Japanese" },
      { code: "ko", name: "Korean" },
      { code: "hi", name: "Hindi" },
    ];

    langs.forEach((l) => {
      const option = document.createElement("option");
      option.value = l.code;
      option.textContent = l.name;
      select.appendChild(option);
    });

    const saved = (await storage.get("target_lang")) || "en";
    select.value = saved;

    select.onchange = async (e) => {
      await storage.set("target_lang", e.target.value);
    };

    container.appendChild(label);
    container.appendChild(select);

    // Strictness Setting
    const strictLabel = document.createElement("label");
    strictLabel.className = "modal-row-left";
    strictLabel.style.marginTop = "16px"; // Keep this as it's a specific spacing between sections

    const strictCheck = document.createElement("input");
    strictCheck.type = "checkbox";
    strictCheck.checked = (await storage.get("quiz_strictness")) !== false; // Default true

    strictCheck.onchange = async (e) => {
      await storage.set("quiz_strictness", e.target.checked);
    };

    strictLabel.appendChild(strictCheck);
    strictLabel.appendChild(
      document.createTextNode("Strict Quiz Matching (Accents)"),
    );
    container.appendChild(strictLabel);
  });

  // 1.1 Settings (Data)
  ui.settings.addSection("tab-data", "Language Learning", async (container) => {
    const cacheLabel = document.createElement("label");
    cacheLabel.className = "modal-row-left";
    cacheLabel.style.marginBottom = "12px";

    const cacheCheck = document.createElement("input");
    cacheCheck.type = "checkbox";
    cacheCheck.checked = (await storage.get("cache_definitions")) !== false; // Default true

    cacheCheck.onchange = async (e) => {
      await storage.set("cache_definitions", e.target.checked);
    };

    cacheLabel.appendChild(cacheCheck);
    cacheLabel.appendChild(
      document.createTextNode("Cache Definitions in Database"),
    );
    container.appendChild(cacheLabel);
  });

  // 2. Stats
  ui.stats.addSection((feed) => {
    const stats = feed.stats || {};
    const translated = stats.wordCountTranslated || 0;
    if (translated === 0) return "";

    const read = stats.wordCountRead || 0;
    const total = Math.max(read, translated);
    const pct =
      total > 0 ? Math.min(100, Math.round((translated / total) * 100)) : 0;

    return `
            <div class="plugin-stats-container">
                <div class="plugin-stats-row">
                    <span>Translated Words</span>
                    <span class="plugin-stats-value">${translated} <span class="plugin-stats-subvalue">/ ${total} (${pct}%)</span></span>
                </div>
                <div class="plugin-stats-progress-bg">
                    <div class="plugin-stats-progress-fill" style="width:${pct}%;"></div>
                </div>
            </div>`;
  });

  // Language Map
  const LANG_MAP = {
    english: "en",
    spanish: "es",
    french: "fr",
    german: "de",
    italian: "it",
    portuguese: "pt-BR",
    "brazilian portuguese": "pt-BR",
    russian: "ru",
    japanese: "ja",
    korean: "ko",
    hindi: "hi",
    arabic: "ar",
    turkish: "tr",
  };

  // Helper to fetch dictionary data
  const fetchDictionary = async (word, lang = "en") => {
    // Check Cache
    const cacheEnabled = (await storage.get("cache_definitions")) !== false;
    const cacheKey = `def:${lang}:${word.toLowerCase()}`;

    if (cacheEnabled) {
      const cached = await storage.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/${lang}/${encodeURIComponent(word)}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const result = Array.isArray(data) ? data[0] : null;

      if (result && cacheEnabled) {
        await storage.set(cacheKey, result);
      }
      return result;
    } catch (e) {
      console.error("Dictionary fetch failed", e);
      return null;
    }
  };

  // Combined Define Tool
  ui.reader.addTool({
    id: "tool-define",
    label: "Define",
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
    shouldShow: (text) => text.trim().split(/\s+/).length === 1,
    onClick: async (text, range) => {
      const word = text.trim();

      // Detect Language
      let lang = "en";
      try {
        const guid = reader.getCurrentGuid();
        if (!guid) throw new Error("No guid");
        const article = await data.getArticle(guid);
        if (!article || !article.feedId)
          throw new Error("No article or feedId");
        const feed = await data.getFeed(article.feedId);
        if (!feed || !feed.tags) throw new Error("No feed or tags");

        for (const tag of feed.tags) {
          const lower = tag.toLowerCase();
          if (LANG_MAP[lower]) {
            lang = LANG_MAP[lower];
            break;
          }
        }
      } catch (e) {
        console.warn("Failed to detect language, defaulting to en", e);
      }

      const dataRes = await fetchDictionary(word, lang);

      if (!dataRes) {
        ui.toast(`Definition not found (${lang}).`);
        return;
      }

      const data = dataRes; // Alias for easier usage below

      // Extract Phonetics
      const phonetic =
        data.phonetics.find((p) => p.audio && p.text) ||
        data.phonetics.find((p) => p.audio) ||
        {};
      const audioUrl = phonetic.audio;
      const textPron = phonetic.text || data.phonetic || "";

      // Sanitize Data
      const safeWord = DOMPurify.sanitize(data.word);
      const safePron = DOMPurify.sanitize(textPron);

      let html = `<div class="dictionary-popover-container">`;

      // Header: Word + Pronunciation
      html += `
        <div class="dictionary-header">
            <div class="dictionary-word-group">
                <h3 class="dictionary-word">${safeWord}</h3>
                ${safePron ? `<span class="dictionary-phonetic">${safePron}</span>` : ""}
            </div>
            ${
              audioUrl
                ? `
            <button class="play-audio-btn" data-audio="${audioUrl}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </button>`
                : ""
            }
        </div>
      `;

      // Meanings
      if (data.meanings && data.meanings.length > 0) {
        data.meanings.forEach((m) => {
          const safePos = DOMPurify.sanitize(m.partOfSpeech);
          html += `<div class="dictionary-meaning">
                <div class="dictionary-pos">${safePos}</div>
                <ul class="dictionary-definitions">`;

          m.definitions.slice(0, 3).forEach((d) => {
            const safeDef = DOMPurify.sanitize(d.definition);
            const safeEx = d.example ? DOMPurify.sanitize(d.example) : "";
            html += `<li class="dictionary-definition-item">
                    ${safeDef}
                    ${safeEx ? `<div class="dictionary-example">"${safeEx}"</div>` : ""}
                  </li>`;
          });

          html += `</ul></div>`;
        });
      } else {
        html += `<div class="dictionary-no-defs">No definitions available.</div>`;
      }

      // Source
      if (data.sourceUrls && data.sourceUrls.length > 0) {
        html += `<div class="dictionary-source">
            Source: <a href="${data.sourceUrls[0]}" target="_blank">Wiktionary</a>
          </div>`;
      }

      html += `</div>`;

      // Show Popover
      const rect = range.getBoundingClientRect();
      ui.popover.show(rect, html);

      // Attach Audio Handler
      const popoverEl = document.getElementById("global-popover");
      const btn = popoverEl.querySelector(".play-audio-btn");
      if (btn) {
        btn.onclick = () => {
          const audio = new Audio(btn.dataset.audio);

          // Visual Feedback
          const originalIcon = document.createElement("div");
          while (btn.firstChild) originalIcon.appendChild(btn.firstChild);

          const svgNS = "http://www.w3.org/2000/svg";
          const svg = document.createElementNS(svgNS, "svg");
          svg.setAttribute("width", "14");
          svg.setAttribute("height", "14");
          svg.setAttribute("viewBox", "0 0 24 24");
          svg.setAttribute("fill", "none");
          svg.setAttribute("stroke", "currentColor");
          svg.setAttribute("stroke-width", "2");
          const rect1 = document.createElementNS(svgNS, "rect");
          rect1.setAttribute("x", "6");
          rect1.setAttribute("y", "4");
          rect1.setAttribute("width", "4");
          rect1.setAttribute("height", "16");
          const rect2 = document.createElementNS(svgNS, "rect");
          rect2.setAttribute("x", "14");
          rect2.setAttribute("y", "4");
          rect2.setAttribute("width", "4");
          rect2.setAttribute("height", "16");
          svg.appendChild(rect1);
          svg.appendChild(rect2);

          while (btn.firstChild) btn.removeChild(btn.firstChild);
          btn.appendChild(svg); // Pause icon representation (or stop)

          audio.onended = () => {
            while (btn.firstChild) btn.removeChild(btn.firstChild);
            while (originalIcon.firstChild)
              btn.appendChild(originalIcon.firstChild);
          };

          audio.play().catch((e) => {
            console.error("Audio play failed", e);
            while (btn.firstChild) btn.removeChild(btn.firstChild);
            while (originalIcon.firstChild)
              btn.appendChild(originalIcon.firstChild);
            ui.toast("Could not play audio");
          });
        };
      }
    },
  });

  // 3. Reader Tool
  ui.reader.addTool({
    id: "tool-translate",
    label: "Translate",
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>',
    onClick: async (text, range) => {
      if (!text) return;

      const targetLang = (await storage.get("target_lang")) || "en";

      await ui.reader.createCAD("translation", async (selectedText) => {
        try {
          const lang = targetLang;
          const pair = `Autodetect|${lang}`;

          ui.toast("Translating...");

          const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedText)}&langpair=${pair}`,
          );
          const apiData = await res.json();

          const translatedText =
            apiData.responseStatus === 200
              ? apiData.responseData.translatedText
              : null;

          if (translatedText) {
            ui.toast("Translation ready");

            // Save Translation for Quiz
            try {
              const translations = (await storage.get("translations")) || [];
              // Avoid duplicates (simple check)
              const exists = translations.some(
                (t) =>
                  t.original === selectedText &&
                  t.translated === translatedText,
              );
              if (!exists) {
                translations.push({
                  original: selectedText,
                  translated: translatedText,
                  lang: targetLang,
                  date: Date.now(),
                });
                await storage.set("translations", translations);
              }
            } catch (err) {
              console.error("Failed to save translation for quiz", err);
            }

            // Update Stats
            const guid = reader.getCurrentGuid();
            if (guid) {
              const article = await data.getArticle(guid);
              if (article && article.feedId) {
                const wordCount = selectedText.trim().split(/\s+/).length;
                await data.stats.update(
                  article.feedId,
                  "wordCountTranslated",
                  wordCount,
                );
                app.refresh();
              }
            }

            return {
              translatedText: translatedText,
              targetLang: targetLang,
            };
          } else {
            throw new Error("Empty response");
          }
        } catch (error) {
          console.error("Translation failed", error);
          ui.toast("Translation failed.");
          return null; // Cancel CAD creation
        }
      });
    },
  });

  // 4. Register CAD Renderer
  ui.reader.addCADRenderer("translation", (content, data) => {
    const translated = data.data?.translatedText || "Translation unavailable";
    return `<span class="translated-text" data-tooltip="${translated}" data-cad-id="${data.id}">${content}</span>`;
  });

  // 5. Add Sidebar Item
  ui.sidebar.addPrimary({
    id: "quiz",
    label: "Language Quiz",
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
    onClick: () => {
      app.switchFeed("custom:quiz");
    },
  });

  // 6. Register Custom View
  ui.addView("quiz", "Language Quiz", (container) => {
    container.classList.add("quiz-view");
    renderQuizContent(container, storage, ui);
  });
}

async function renderQuizContent(container, storage, ui) {
  while (container.firstChild) container.removeChild(container.firstChild);

  // Load Settings
  const mode = (await storage.get("quiz_mode")) || "original_to_translated"; // or translated_to_original

  // Quiz Container
  const quizContainer = document.createElement("div");
  quizContainer.className = "quiz-container";
  container.appendChild(quizContainer);

  // Mode Toggle
  const toggle = document.createElement("div");
  toggle.className = "quiz-mode-toggle";

  const indicator = document.createElement("div");
  indicator.className = "quiz-mode-indicator";

  const opt1 = document.createElement("div");
  opt1.className = `quiz-mode-option ${mode === "original_to_translated" ? "active" : ""}`;
  opt1.dataset.val = "original_to_translated";
  opt1.textContent = "Original → Translated";

  const opt2 = document.createElement("div");
  opt2.className = `quiz-mode-option ${mode === "translated_to_original" ? "active" : ""}`;
  opt2.dataset.val = "translated_to_original";
  opt2.textContent = "Translated → Original";

  toggle.appendChild(indicator);
  toggle.appendChild(opt1);
  toggle.appendChild(opt2);

  quizContainer.appendChild(toggle);

  // Toggle Logic
  const updateToggle = (val) => {
    const indicator = toggle.querySelector(".quiz-mode-indicator");
    const opts = toggle.querySelectorAll(".quiz-mode-option");

    opts.forEach((o) => {
      if (o.dataset.val === val) o.classList.add("active");
      else o.classList.remove("active");
    });

    if (val === "original_to_translated") {
      indicator.style.transform = "translateX(0)";
    } else {
      indicator.style.transform = "translateX(100%)";
    }
  };

  // Initial position
  setTimeout(() => updateToggle(mode), 0);

  toggle.onclick = async (e) => {
    const target = e.target.closest(".quiz-mode-option");
    if (!target) return;

    const newVal = target.dataset.val;
    await storage.set("quiz_mode", newVal);
    updateToggle(newVal);
    loadQuestion();
  };

  const translations = (await storage.get("translations")) || [];

  if (translations.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "quiz-empty-msg";
    emptyMsg.textContent =
      "No translations saved yet. Use the Translate tool in the reader to build your vocabulary!";
    quizContainer.appendChild(emptyMsg);
    return;
  }

  // Quiz Card Area
  const cardArea = document.createElement("div");
  cardArea.className = "quiz-card";
  quizContainer.appendChild(cardArea);

  let currentItem = null;

  const loadQuestion = async () => {
    const currentMode =
      (await storage.get("quiz_mode")) || "original_to_translated";
    // Pick random
    currentItem = translations[Math.floor(Math.random() * translations.length)];

    const questionText =
      currentMode === "original_to_translated"
        ? currentItem.original
        : currentItem.translated;

    while (cardArea.firstChild) cardArea.removeChild(cardArea.firstChild);

    const entryInfo = document.createElement("div");
    entryInfo.className = "quiz-entry-info";
    entryInfo.textContent = `Entry ${translations.indexOf(currentItem) + 1} / ${translations.length}`;

    const qDiv = document.createElement("div");
    qDiv.className = "quiz-question";
    qDiv.textContent = questionText;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "quiz-input";
    input.placeholder = "Type your answer...";
    input.autocomplete = "off";

    const controls = document.createElement("div");
    controls.className = "quiz-controls";

    const btnSkip = document.createElement("button");
    btnSkip.className = "btn btn-outline";
    btnSkip.id = "btn-skip";
    btnSkip.textContent = "Skip";

    const btnCheck = document.createElement("button");
    btnCheck.className = "btn btn-primary";
    btnCheck.id = "btn-check";
    btnCheck.textContent = "Check Answer";

    controls.appendChild(btnSkip);
    controls.appendChild(btnCheck);

    const feedback = document.createElement("div");
    feedback.className = "quiz-feedback";
    feedback.setAttribute("hidden", "");

    cardArea.appendChild(entryInfo);
    cardArea.appendChild(qDiv);
    cardArea.appendChild(input);
    cardArea.appendChild(controls);
    cardArea.appendChild(feedback);

    input.focus();

    const checkAnswer = async () => {
      const userAns = input.value.trim();
      if (!userAns) return;

      // Use storage for strictness setting
      const isStrict = (await storage.get("quiz_strictness")) !== false;
      const targetAns =
        currentMode === "original_to_translated"
          ? currentItem.translated
          : currentItem.original;

      let correct = false;
      if (isStrict) {
        correct = userAns.toLowerCase() === targetAns.toLowerCase();
      } else {
        // Remove accents
        const normalize = (str) =>
          str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        correct = normalize(userAns) === normalize(targetAns);
      }

      feedback.removeAttribute("hidden");
      if (correct) {
        feedback.className = "quiz-feedback correct";
        feedback.textContent = "Correct! Great job.";
        btnCheck.textContent = "Next Question";
        btnCheck.onclick = loadQuestion;
        btnSkip.setAttribute("hidden", "");
        input.disabled = true;
      } else {
        feedback.className = "quiz-feedback incorrect";
        while (feedback.firstChild) feedback.removeChild(feedback.firstChild);
        feedback.appendChild(
          document.createTextNode("Incorrect. The answer was: "),
        );
        const br = document.createElement("br");
        feedback.appendChild(br);
        const strong = document.createElement("strong");
        strong.className = "quiz-feedback-answer";
        strong.textContent = targetAns;
        feedback.appendChild(strong);

        btnCheck.textContent = "Next Question";
        btnCheck.onclick = loadQuestion;
        btnSkip.setAttribute("hidden", "");
        input.disabled = true;
      }
    };

    btnCheck.onclick = checkAnswer;
    btnSkip.onclick = loadQuestion;

    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        if (btnCheck.textContent.includes("Next")) loadQuestion();
        else checkAnswer();
      }
    };
  };

  loadQuestion();
}
