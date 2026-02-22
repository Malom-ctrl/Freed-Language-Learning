export function activate(context) {
  const { ui, data, app, reader, storage } = context;

  // 0. Inject Styles
  const styleId = "plugin-translation-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
            .translating {
                animation: pulse-underline 1.5s infinite;
                border-bottom: 2px solid var(--primary);
                background: rgba(79, 70, 229, 0.1);
                border-radius: 2px;
            }
            @keyframes pulse-underline {
                0% { border-color: rgba(79, 70, 229, 0.3); }
                50% { border-color: rgba(79, 70, 229, 1); }
                100% { border-color: rgba(79, 70, 229, 0.3); }
            }
            .translated-text {
                border-bottom: 2px dotted var(--primary);
                cursor: help;
                background-color: rgba(79, 70, 229, 0.05);
                border-radius: 2px;
                transition: background-color 0.2s;
            }
            .translated-text:hover {
                background-color: rgba(79, 70, 229, 0.2);
            }
            /* Quiz Styles */
            .quiz-container {
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 60vh;
            }
            .quiz-card {
                background: var(--bg-card);
                border: 1px solid var(--border);
                border-radius: 16px;
                padding: 40px;
                text-align: center;
                margin-top: 20px;
                width: 100%;
                max-width: 600px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            .quiz-question {
                font-size: 2rem;
                font-weight: 700;
                margin-bottom: 30px;
                color: var(--text-main);
                line-height: 1.2;
            }
            .quiz-input {
                width: 100%;
                padding: 16px;
                border: 2px solid var(--border);
                border-radius: 12px;
                margin-bottom: 24px;
                font-size: 1.2rem;
                background: var(--bg-body);
                color: var(--text-main);
                text-align: center;
                transition: border-color 0.2s;
            }
            .quiz-input:focus {
                border-color: var(--primary);
                outline: none;
            }
            .quiz-feedback {
                margin-top: 24px;
                padding: 16px;
                border-radius: 12px;
                font-weight: 600;
                font-size: 1.1rem;
            }
            .quiz-feedback.correct {
                background: rgba(16, 185, 129, 0.1);
                color: #10b981;
            }
            .quiz-feedback.incorrect {
                background: rgba(239, 68, 68, 0.1);
                color: #ef4444;
            }
            .quiz-controls {
                display: flex;
                gap: 16px;
                justify-content: center;
            }
            .quiz-controls .btn {
                padding: 12px 24px;
                font-size: 1rem;
            }
            /* Toggle Switch Styles */
            .quiz-mode-toggle {
                display: flex;
                background: var(--bg-card);
                border: 3px solid var(--border);
                border-radius: 9999px;
                margin-bottom: 30px;
                position: relative;
                cursor: pointer;
                user-select: none;
            }
            .quiz-mode-option {
                padding: 8px 20px;
                border-radius: 9999px;
                font-size: 0.9rem;
                font-weight: 600;
                color: var(--text-muted);
                z-index: 2;
                transition: color 0.2s;
            }
            .quiz-mode-option.active {
                color: var(--text-main);
            }
            .quiz-mode-indicator {
                position: absolute;
                top: 0;
                bottom: 0;
                width: 50%; /* Approximate, will calculate */
                background: var(--bg-body);
                border-radius: 9999px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                transition: transform 0.2s ease;
                z-index: 1;
            }

            /* Quiz View Override */
            #article-list.quiz-view {
                display: block !important;
                padding: 0 !important;
            }
        `;
    document.head.appendChild(style);
  }

  // 1. Settings (Target Language)
  ui.settings.addSection("tab-general", "Translation", async (container) => {
    const label = document.createElement("label");
    label.textContent = "Target Language";
    label.style.display = "block";
    label.style.marginBottom = "6px";
    label.style.fontWeight = "600";
    label.style.color = "var(--text-muted)";

    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.marginBottom = "16px";

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

    select.innerHTML = langs
      .map((l) => `<option value="${l.code}">${l.name}</option>`)
      .join("");

    const saved = (await storage.get("target_lang")) || "en";
    select.value = saved;

    select.onchange = async (e) => {
      await storage.set("target_lang", e.target.value);
    };

    container.appendChild(label);
    container.appendChild(select);

    // Strictness Setting
    const strictLabel = document.createElement("label");
    strictLabel.style.display = "flex";
    strictLabel.style.alignItems = "center";
    strictLabel.style.gap = "8px";
    strictLabel.style.marginTop = "16px";
    strictLabel.style.fontWeight = "600";
    strictLabel.style.color = "var(--text-muted)";

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
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; font-size: 0.9rem; margin-bottom: 6px;">
                    <span>Translated Words</span>
                    <span style="font-weight:600;">${translated} <span style="font-weight:400;color:var(--text-muted);font-size:0.8em">/ ${total} (${pct}%)</span></span>
                </div>
                <div style="width:100%; height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:var(--primary);"></div>
                </div>
            </div>`;
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
  container.innerHTML = "";

  // Load Settings
  const mode = (await storage.get("quiz_mode")) || "original_to_translated"; // or translated_to_original

  // Quiz Container
  const quizContainer = document.createElement("div");
  quizContainer.className = "quiz-container";
  container.appendChild(quizContainer);

  // Mode Toggle
  const toggle = document.createElement("div");
  toggle.className = "quiz-mode-toggle";
  toggle.innerHTML = `
      <div class="quiz-mode-indicator"></div>
      <div class="quiz-mode-option ${mode === "original_to_translated" ? "active" : ""}" data-val="original_to_translated">Original → Translated</div>
      <div class="quiz-mode-option ${mode === "translated_to_original" ? "active" : ""}" data-val="translated_to_original">Translated → Original</div>
  `;
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
    emptyMsg.style.textAlign = "center";
    emptyMsg.style.color = "var(--text-muted)";
    emptyMsg.style.marginTop = "40px";
    emptyMsg.innerHTML =
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

    cardArea.innerHTML = `
            <div style="text-align:center; margin-bottom:10px; color:var(--text-muted); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px;">
                Entry ${translations.indexOf(currentItem) + 1} / ${translations.length}
            </div>
            <div class="quiz-question">${questionText}</div>
            <input type="text" class="quiz-input" placeholder="Type your answer..." autocomplete="off">
            <div class="quiz-controls">
                <button class="btn btn-outline" id="btn-skip">Skip</button>
                <button class="btn btn-primary" id="btn-check">Check Answer</button>
            </div>
            <div class="quiz-feedback" style="display:none"></div>
        `;

    const input = cardArea.querySelector("input");
    const btnCheck = cardArea.querySelector("#btn-check");
    const btnSkip = cardArea.querySelector("#btn-skip");
    const feedback = cardArea.querySelector(".quiz-feedback");

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

      feedback.style.display = "block";
      if (correct) {
        feedback.className = "quiz-feedback correct";
        feedback.textContent = "Correct! Great job.";
        btnCheck.textContent = "Next Question";
        btnCheck.onclick = loadQuestion;
        btnSkip.style.display = "none";
        input.disabled = true;
      } else {
        feedback.className = "quiz-feedback incorrect";
        feedback.innerHTML = `Incorrect. The answer was: <br><strong style="font-size:1.2rem; display:block; margin-top:8px;">${targetAns}</strong>`;
        btnCheck.textContent = "Next Question";
        btnCheck.onclick = loadQuestion;
        btnSkip.style.display = "none";
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
