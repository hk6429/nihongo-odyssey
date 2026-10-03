# 第三方資料與授權

`data/vocabulary.json` 改作自 **egg rolls** 製作的 [JLPT N1–N5 Anki 牌組](https://github.com/5mdld/anki-jlpt-decks)。繁體中文資料由 **ShihHsing Chen** 提供。固定來源版本為 `853798a4dec3630cad1984aa1c7edab31b09d109`。

詞彙資料依 [Creative Commons 姓名標示－非商業性 4.0 國際授權（CC BY-NC 4.0）](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hant) 使用。完整授權原文保存在 [sources/anki-jlpt-decks/LICENSE](sources/anki-jlpt-decks/LICENSE)，來源說明保存在 [sources/anki-jlpt-decks/README.md](sources/anki-jlpt-decks/README.md)。

本網站將該資料轉為供非營利教學使用的 JSON：選取繁體中文欄位、清除 HTML 與 Anki 注音標記、將外來語詞源欄位改為片假名讀音、合併相同詞形及讀音的釋義，並保留各來源級別與識別碼。只匯入文字，不包含上游音訊、字型、卡片模板或程式。

使用、修改或再散布這份詞彙資料時，須保留原作者標示、來源及授權連結，說明改作，且不得用於商業目的。上游明列的禁止用途包含整合付費產品或服務、商業廣告及行銷推廣。不得增加限制授權所允許使用方式的法律條件或技術措施。本專案的程式授權不會取代詞彙資料的授權。

詞彙級別採用上游社群分類，供學習參考；**不是 JLPT 官方詞彙表，也不保證涵蓋考試全部詞彙**。原作者及資料提供者沒有為本網站背書。原始來源聲明內容包含公開網路資源及個人創作；本專案保留其授權與免責條款。

可重跑匯入方式、來源 SHA-256 與完整性報告，見 [sources/README.md](sources/README.md) 及 [docs/vocabulary-audit.json](docs/vocabulary-audit.json)。

## 本站教材補充層

[data/vocabulary-overrides.json](data/vocabulary-overrides.json) 為本站新增的原創例句及抽查校訂，依來源識別碼套用；原始來源快照不改寫。122 個原來源缺例句詞已補原創例句；另修正部分釋義、語用提示與中文錯字。介面標示原創補充，與來源語例分開。這些改作不改變上游詞庫的 CC BY-NC 4.0 限制，也不代表來源作者或真人日語教師審定本站課程。

25 章情境目標、句型、兩分支微劇情及新情境練習存於 [lessons.js](lessons.js)，為本站原創教學設計；非 JLPT 官方分級認證。
