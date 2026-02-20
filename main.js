export function activate(context) {
  const { ui, data, app, reader } = context;

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
        `;
    document.head.appendChild(style);
  }

  // 1. Settings
  ui.settings.addSection("tab-general", "Translation", (container) => {
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
    const saved = localStorage.getItem("freed_target_lang") || "en";
    select.value = saved;

    select.onchange = (e) => {
      localStorage.setItem("freed_target_lang", e.target.value);
    };

    container.appendChild(label);
    container.appendChild(select);
  });

  // 2. Stats
  ui.stats.addSection((feed) => {
    const stats = feed.stats || {};
    const translated = stats.wordCountTranslated || 0;
    if (translated === 0) return "";

    const read = stats.wordCountRead || 0;
    // Ensure denominator is at least equal to translated to avoid > 100% if data is slightly out of sync
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

      const targetLang = localStorage.getItem("freed_target_lang") || "en";

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
}
