# 離線 App 測試候選版

這不是部署工具。不得用附件覆蓋中央專案。最新 54n 原始碼及中央.gs 尚未取得，09:00 自動發布閘門尚未核實。

本工具只接受兩份已盤點附件的 SHA-256，不依檔名選版本。其他版本會拒絕輸出；取得最新來源後必須先比對移植，不能將新版本加入白名單就當作驗證完成。

```sh
python3 tools/gas/build_test_candidate.py '/path/to/archived/App (3).html' /workspace/test-candidate/App.html
npm ci --prefix tests/gas --cache /workspace/dev-tools/npm-cache --no-audit --no-fund
node tests/gas/regression.cjs /workspace/test-candidate/App.html
```

輸出包含完整 App，沒有取代原檔。原始來源應保留在 checkout 外，勿公開包含個人帳號的截圖或資料。測試載入器用 Acorn 擷取函式與明確的模型常數，將 GAS 模板占位轉成 null 後剖析；不執行 App 的頂層啟動、登入、網路請求或資產寫入。資料取得、排程、部分畫面容器用 stub，因此不是瀏覽器或 GAS 端到端驗證。

修正範圍：收藏品固定類別參數不再產生無實證評級；缺資料一路保留為未知，個別資產、綜合頁、首頁、歷史均處理；回測拒絕缺少指定資產及不完整月資料；配置試算失敗會清除舊結果並說明缺項；拒絕無效年齡。未變更既有七種配置、下滑曲線、現金政策、持倉、帳務及圖表。

沒有逐卡成交資料，故不提供球員卡預測模型、風險常數或聲稱樣本外效能。既有其他資產參數及代理資料並未在本批全面校準；其研究與樣本外驗證仍待完成。
