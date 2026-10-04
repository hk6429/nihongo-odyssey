# 25 小關情境滿版修正

2026-10-04，根代理直接執行，延續本對話部署授權。

## 契約與變更
- 修正進度抽屜圖文重疊：移除舊 realm-panel 圖卡，清單採純文字，標頭不再覆蓋進度。
- 五大關切換回滿版；各小關在 mapView 先顯示專屬場景，再進入原有閱讀。
- shell 依明確 sceneId／練習 chapterId／考驗 chapterId／activeEpisode 決定背景，延續至學習與解析。
- 不變更 engine、題庫或存檔格式。
- 25 張情境圖由內建 imagegen 逐張生成，WebP 壓縮後進 assets/scenes。

## 本輪里程碑
- app-flow 17 項測試通過，新增逐一切換 25 小關且比對存檔不變的測試。
- 圖片生成中：functions cell 237，完成後讀 chapter_generations store 取得輸出路徑；首張 sceneN5-1 另存 store。
- 待圖片落盤、25 張唯一性與場景查核、桌機/手機瀏覽器驗證、build、部署及正式資產讀回。
- 本機 PORT=4297 server exec session 42917，工作結束停止。

## 完成素材與本機驗收
- 25 張 WebP 合計 9,345,264 bytes，SHA-256 全部唯一。已逐張檢視五組縮圖，對應各小關故事。
- 新增圖片格式、大小及唯一性檢查，全套 70 項測試通過；build 48 個公開檔案。
- 桌機霧森滿版、手機樹門情境、兩種尺寸進度選單均已截圖；無水平溢出或圖文重疊。
- 實測小關預覽→故事閱讀→返回小關，背景與標題保持一致；console 無錯誤。
- 原始 PNG 保留在 Codex generated_images；專案使用 WebP，提示詞存於 chapter-art-prompts.json。
- 待發布核對 28 個正式資產（25 圖、首頁、程式、CSS）。

## 發布驗收完成
- Cloudflare 版本：a89dd0cc-c163-4171-be6a-604556f24353。
- 28/28 個正式資產 HTTP 200、SHA-256、nosniff 通過，25 張 WebP MIME 正確，詳見 chapter-scenes-readback.json。
- 正式站選 N3 → 第 3 小關「兩個都對的答案」，圖片自然寬度 1672，載入成功、console 無錯誤。
- 正式截圖：Downloads/和風字旅霧森小關.png。
