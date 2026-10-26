# 必要除錯：個股／ETF代理資料（研究修正，未部署）

產生工具：`tools/gas/build_provenance_candidate.py`。輸入釘住54p的App／核心，輸出54q本機研究候選；不自動發布，也未交付使用者上傳。

```sh
python3 tools/gas/build_provenance_candidate.py tools/gas/candidates/central-54p-test/App.html tools/gas/candidates/central-54p-test/核心.gs /workspace/central-54q-research
node tests/gas/provenance.test.cjs /workspace/central-54q-research/App.html
node tests/gas/regression.cjs /workspace/central-54q-research/App.html
node tests/gas/coverage-panel.test.cjs /workspace/central-54q-research/App.html
```

本輪實際結果：8項新增來源測試、22項既有App測試、10項覆蓋率／函式渲染測試全通過。均為匿名合成fixtures，不是市場研究回測或GAS線上驗收。

已改：
- ownOnly單檔缺自身歷史時不再建立大盤代理序列，因此不能由此入口給個股／ETF偽歷史評級。
- 有自身資料時由自身起始月取到截止月；內部缺月保留null，末月不足不補值，交由既有完整性檢查拒絕評級；真0仍是觀測值。
- 預設情境代理保留以免未完成整合就讓金融資產從總額消失，但新增來源種類、觀測／代理／缺失月數，mixed不再一概標real:true。

尚未完成，故禁止部署：
- 預設金融組合與rateLong長期回測仍可能使用代理；新增metadata尚未整合全部UI、總評、風險提示與月度歷史。
- ownOnly真有資料不代表模型研究、十年長期外推及其樣本外已驗證。
- 發現並保留此範圍，避免用「沒有資料就不算金融資產」造成總資產漏算。

外部研究：developer.ebay.com官方Marketplace Insights文件及statsapi.mlb.com球員查詢本輪均CONNECT 403。官方頁未讀到，不能聲稱確認API授權或可取真成交；嘗試的GitHub OpenAPI路徑404、候選repo不存在，不把它們列有效來源。沒有取得真實球卡成交庫，也沒有估新模型參數。
